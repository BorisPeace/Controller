/*
 * *******************************************************************************
 *  * Copyright (c) 2018 Edgeworx, Inc.
 *  *
 *  * This program and the accompanying materials are made available under the
 *  * terms of the Eclipse Public License v. 2.0 which is available at
 *  * http://www.eclipse.org/legal/epl-2.0
 *  *
 *  * SPDX-License-Identifier: EPL-2.0
 *  *******************************************************************************
 *
 */

const nodemailer = require('nodemailer');
let smtpTransport = require('nodemailer-smtp-transport');
const UserManager = require('../sequelize/managers/user-manager');
const AppHelper = require('../helpers/app-helper');
const Errors = require('../helpers/errors');

const config = require('../config');

const emailActivationTemplate = require('../views/email-activation-temp');
const EmailActivationCodeService = require('./email-activation-code-service');

const AccessTokenService = require('./access-token-service');

const ConfigHelper = require('../helpers/config-helper');
const logger = require('../logger');
const constants = require('../helpers/constants');

const TransactionDecorator = require('../decorators/transaction-decorator');

const createUser = async function (user, transaction) {
  return await UserManager.create(user, transaction)
};

const signUp = async function (user, transaction) {

  let emailActivation = ConfigHelper.getConfigParam('email_activation') || 'off';

  AppHelper.validateFields(user, ["firstName", "lastName", "email", "password"]);
  _validateUserInfo(user);

  if (emailActivation === 'on') {

    const newUser = await _handleCreateUser(user, emailActivation, transaction);

    const activationCodeData = await EmailActivationCodeService.generateActivationCode(transaction);
    await EmailActivationCodeService.saveActivationCode(newUser.id, activationCodeData, transaction);

    const emailData = await _getEmailData(transaction);
    const transporter = await _userEmailSender(emailData);
    await _notifyUserAboutActivationCode(user.email, "https://google.com", emailData, activationCodeData, transporter);
    return newUser;
  } else {
    return await _handleCreateUser(user, emailActivation, transaction);
  }
};

const login = async function (credentials, transaction) {

  AppHelper.validateFields(credentials, ["email", "password"]);
  const user = await UserManager.findOne({
    email: credentials.email
  }, transaction);

  const validPassword = credentials.password === user.password || credentials.password === user.tempPassword;
  if (!user || !validPassword) {
    throw new Errors.InvalidCredentialsError();
  }

  _verifyEmailActivation(user.emailActivated);

  const accessToken = await _generateAccessToken(transaction);
  accessToken.user_id = user.id;

  await AccessTokenService.createAccessToken(accessToken, transaction);

  return {
    accessToken: accessToken.token
  }
};

const resendActivation = async function (emailObj, transaction) {

  AppHelper.validateFields(emailObj, ["email"]);

  const user = await UserManager.findOne({
    email: emailObj.email
  }, transaction);
  if (!user)
    throw new Errors.ValidationError("Invalid user email.");

  const activationCodeData = await EmailActivationCodeService.generateActivationCode(transaction);
  await EmailActivationCodeService.saveActivationCode(user.id, activationCodeData, transaction);

  const emailData = await _getEmailData(transaction);
  const transporter = await _userEmailSender(emailData);
  await _notifyUserAboutActivationCode(user.email, "https://google.com", emailData, activationCodeData, transporter);
};

const activateUser = async function (codeData, transaction) {

  AppHelper.validateFields(codeData, ["activationCode"]);
  const activationCode = await EmailActivationCodeService.verifyActivationCode(codeData.activationCode, transaction);
  if (!activationCode) {
    throw new Errors.NotFoundError('Activation code not found')
  }

  const updatedObj = {
    emailActivated: 1
  };

  await _updateUser(activationCode.user_id, updatedObj, transaction);
  await EmailActivationCodeService.deleteActivationCode(codeData.activationCode, transaction);
};

const logout = async function (user, transaction) {
  return await AccessTokenService.removeAccessTokenByUserId(user.id, transaction)
};

async function _updateUser(userId, updatedUser,  transaction) {
  try {
    return await UserManager.update({
      id: userId
    }, updatedUser, transaction)
  } catch (errMsg) {
    throw new Error('User not updated')
  }
}

async function _generateAccessToken(transaction) {
  while (true) {
    let newAccessToken = AppHelper.generateAccessToken();
    const exists = await UserManager.findByAccessToken(newAccessToken, transaction);
    if (!exists) {
      let tokenExpiryTime = new Date().getTime() + (config.get('Settings:UserTokenExpirationIntervalSeconds') * 1000);

      return {
        token: newAccessToken,
        expirationTime: tokenExpiryTime
      };
    }
  }
}

function _verifyEmailActivation(emailActivated) {
  const emailActivation = ConfigHelper.getConfigParam('email_activation');
  if (emailActivation === 'on' && emailActivated === 0)
    throw new Error('Email is not activated. Please activate your account first.');
}


async function _userEmailSender(emailData) {
  let transporter;
  if (emailData.service) {
    transporter = nodemailer.createTransport(smtpTransport({
      service: emailData.service,
      auth: {
        user: emailData.email,
        pass: emailData.password
      }
    }));
  } else {
    transporter = nodemailer.createTransport(smtpTransport({
      host: emailData.host,
      port: emailData.port,
      auth: {
        user: emailData.email,
        pass: emailData.password
      }
    }))
  }

  return transporter
}

async function _handleCreateUser(user, emailActivation, transaction) {
  const existingUser = await UserManager.findOne({
    email: user.email
  }, transaction);

  if (existingUser) {
    throw new Errors.ValidationError('Registration failed: There is already an account associated with your email address. Please try logging in instead.');
  }
  await _validateUserInfo(user);
  return await _createNewUser(user, emailActivation, transaction);
}

function _validateUserInfo(user) {
  if (!AppHelper.isValidEmail(user.email)) {
    throw new Errors.ValidationError('Registration failed: Please enter a valid email address.');
  } else if (!user.password.length > 7) {
    throw new Errors.ValidationError('Registration failed: Your password must have at least 8 characters.');
  } else if (!user.firstName.length > 2) {
    throw new Errors.ValidationError('Registration failed: First Name length should be at least 3 characters.');
  } else if (!user.lastName.length > 2) {
    throw new Errors.ValidationError('Registration failed: Last Name length should be at least 3 characters.');
  }
}

async function _createNewUser(user, emailActivation, transaction) {
  user.emailActivated = emailActivation === 'on' ? 0 : 1;
  return await createUser(user, transaction)
}

async function _notifyUserAboutActivationCode(email, url, emailSenderData, activationCodeData, transporter) {
  let mailOptions = {
    from: '"IOFOG" <' + emailSenderData.email + '>', // sender address
    to: email, // list of receivers
    subject: 'Activate Your Account', // Subject line
    html: emailActivationTemplate.p1 + url + emailActivationTemplate.p2 + activationCodeData.activationCode + emailActivationTemplate.p3 + url + emailActivationTemplate.p4 + activationCodeData.activationCode + emailActivationTemplate.p5 + url + emailActivationTemplate.p6 + activationCodeData.activationCode + emailActivationTemplate.p7 // html body
  };

  // send mail with defined transport object
  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      throw new Error('Email not sent due to technical reasons. Please try later.');
    } else {
      logger.info('Message %s sent: %s', info.messageId, info.response);
    }
  });
}

async function _getEmailData(transaction) {
  const response = {};
  await ConfigHelper.getAllConfigs(transaction).then(async () => {
    response.email = ConfigHelper.getConfigParam(constants.CONFIG.email_address);
    response.password = ConfigHelper.getConfigParam(constants.CONFIG.email_password);
    response.service = ConfigHelper.getConfigParam(constants.CONFIG.email_service);
    response.host = ConfigHelper.getConfigParam(constants.CONFIG.email_server);
    response.port = ConfigHelper.getConfigParam(constants.CONFIG.email_serverport);
  });

  return response;
}

module.exports = {
  signUp: TransactionDecorator.generateTransaction(signUp),
  login: TransactionDecorator.generateTransaction(login),
  resendActivation: TransactionDecorator.generateTransaction(resendActivation),
  activateUser: TransactionDecorator.generateTransaction(activateUser),
  logout: TransactionDecorator.generateTransaction(logout)
};