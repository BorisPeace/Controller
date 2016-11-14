import SatelliteManager from '../managers/satelliteManager';
import AppUtils from '../utils/appUtils';

const getSatelliteById = function(params, callback) {
  SatelliteManager
    .findById(params.satellitePort.satellite_id)
    .then(AppUtils.onFind.bind(null, params, 'satellite', 'Cannot find Satellite', callback));
}

const getRandomSatellite = function(params, callback) {
  var randomNumber;

  SatelliteManager.findAll()
    .then((satellites) => {
      if (satellites && satellites.length > 0) {
        randomNumber = Math.round((Math.random() * (satellites.length - 1)));
        console.log('Random number ' + randomNumber);
        params.satellite = satellites[randomNumber];
        callback(null, params);
      } else {
        callback('error', 'No Satellite defined');
      }
    });
}

export default {
  getSatelliteById: getSatelliteById,
  getRandomSatellite: getRandomSatellite,

};