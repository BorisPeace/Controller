/**
 * @file instanceRoutingController.js
 * @author Zishan Iqbal
 * @description This file includes the implementation of the instance-routing end-point
 */

import async from 'async';
import express from 'express';
const router = express.Router();
import BaseApiController from './baseApiController';

import ChangeTrackingService from '../../services/changeTrackingService';
import ComsatService from '../../services/comsatService';
import DataTracksService from '../../services/dataTracksService';
import ElementService from '../../services/elementService';
import ElementInstanceService from '../../services/elementInstanceService';
import FabricService from '../../services/fabricService';
import FabricTypeService from '../../services/fabricTypeService';
import NetworkPairingService from '../../services/networkPairingService';
import RoutingService from '../../services/routingService';
import SatelliteService from '../../services/satelliteService';
import SatellitePortService from '../../services/satellitePortService';
import ConsoleService from '../../services/consoleService';
import StreamViewerService from '../../services/streamViewerService';
import UserService from '../../services/userService';

import AppUtils from '../../utils/appUtils';
import Constants from '../../constants.js';

router.get('/api/v2/instance/routing/id/:ID/token/:Token', BaseApiController.checkUserExistance, (req, res) => {
  instanceRouting(req, res);
});

router.post('/api/v2/instance/routing/id/:ID/token/:Token', BaseApiController.checkUserExistance, (req, res) => {
  instanceRouting(req, res);
});

const instanceRouting = function (req, res){
  var params = {},
      streamViewerProps = {
        instanceId: 'bodyParams.ID',
        setProperty: 'streamViewerData'
      },
      consoleProps = {
        instanceId: 'bodyParams.ID',
        setProperty: 'consoleData'
      },
      routingProps = { 
        instanceId: 'bodyParams.ID',
        setProperty: 'routingData'
      };

  params.bodyParams = req.params;

  async.waterfall([
    async.apply(StreamViewerService.getStreamViewerByFogInstanceId, streamViewerProps, params),
    async.apply(ConsoleService.getConsoleByFogInstanceId, consoleProps),
    async.apply(RoutingService.findByInstanceId, routingProps),
    getRouting
 ], function(err, result) {
    AppUtils.sendResponse(res, err, 'routing', params.containerList, result);
  });
};

  const getRouting = function (params, callback) {
    var containerList = [];
    for (let i = 0; i < params.routingData.length; i++) {
      var container = params.routingData[i],
          containerID = container.publishing_element_id,
          destinationElementID = container.destination_element_id,
          foundIt = false;

      params.container = container;

      for (var j = 0; j < containerList.length; j++) {
        var curItem = containerList[j],
            curID = curItem.container;

        if (curID == containerID) {
          foundIt = true;
          var outElementLabel = destinationElementID;

          if (destinationElementID == params.streamViewerData.element_id) {
            outElementLabel = "viewer";
          }
          if (destinationElementID == params.consoleData.elementId) {
            outElementLabel = "debug";
          }
            containerList[j]["receivers"].push(outElementLabel);
        }
      }
      if (foundIt == false) {
        var tmpNewContainerItem = {},
            receiverList = new Array(),
            outElementLabel = destinationElementID;
              
            tmpNewContainerItem.container = containerID;

        if (destinationElementID ==  params.streamViewerData.element_id) {
          outElementLabel = "viewer";
          }
        if (destinationElementID == params.consoleData.elementId) {
          outElementLabel = "debug";
          }
        
        receiverList.push(outElementLabel);

        tmpNewContainerItem.receivers = receiverList;
        containerList.push(tmpNewContainerItem);
      }
    }
    params.containerList = containerList;
    callback(null, params);
  }

router.post('/api/v2/authoring/element/instance/route/create', (req, res) => {
  var params = {},
    currentTime = new Date().getTime(),
    watefallMethods = [],

    userProps = {
      userId: 'bodyParams.userId',
      setProperty: 'user'
    },

    pubFogProps = {
      fogId: 'bodyParams.publishingInstanceId',
      setProperty: 'publishingFogInstance'
    },

    destFogProps = {
      fogId: 'bodyParams.destinationInstanceId',
      setProperty: 'destinationFogInstance'
    },

    pubFogTypeProps = {
      fogTypeId: 'publishingFogInstance.typeKey',
      setProperty: 'pubFogType'
    },

    destFogTypeProps = {
      fogTypeId: 'destinationFogInstance.typeKey',
      setProperty: 'destFogType'
    },

    pubNetworkElementProps = {
      networkElementId: 'pubFogType.networkElementKey',
      setProperty: 'pubNetworkElement'
    },

    destNetworkElementProps = {
      networkElementId: 'destFogType.networkElementKey',
      setProperty: 'destNetworkElement'
    },

    networkPairingProps = {
      instanceId1: 'publishingFogInstance.uuid',
      instanceId2: 'destinationFogInstance.uuid',
      elementId1: 'bodyParams.publishingElementId',
      elementId2: 'bodyParams.destinationElementId',
      networkElementId1: 'pubNetworkElementInstance.uuid',
      networkElementId2: 'destNetworkElementInstance.uuid',
      isPublic: false,
      elementPortId: 'elementInstancePort.id',
      satellitePortId: 'satellitePort.id',
      setProperty: 'networkPairingObj'
    },

    routingProps = {
      publishingInstanceId: 'publishingFogInstance.uuid',
      destinationInstanceId: 'publishingFogInstance.uuid',
      publishingElementId: 'bodyParams.publishingElementId',
      destinationElementId: 'bodyParams.destinationElementId',
      isNetworkConnection: false,
      setProperty: 'route'
    },

    pubRoutingProps = {
      publishingInstanceId: 'publishingFogInstance.uuid',
      destinationInstanceId: 'publishingFogInstance.uuid',
      publishingElementId: 'bodyParams.publishingElementId',
      destinationElementId: 'pubNetworkElementInstance.uuid',
      isNetworkConnection: true,
      setProperty: 'publisingRoute'
    },

    destRoutingProps = {
      publishingInstanceId: 'destinationFogInstance.uuid',
      destinationInstanceId: 'destinationFogInstance.uuid',
      publishingElementId: 'destNetworkElementInstance.uuid',
      destinationElementId: 'bodyParams.destinationElementId',
      isNetworkConnection: true,
      setProperty: 'destinationRoute'
    },

    pubElementProps = {
      elementInstanceId: 'bodyParams.publishingElementId',
      setProperty: 'publishingElementInstance'
    },

    pubNetworkInstanceProps = {
      networkElement: 'pubNetworkElement',
      fogInstanceId: 'publishingFogInstance.uuid',
      satellitePort: 'satellitePort.port1',
      satelliteDomain: 'satellite.domain',
      trackId: 'bodyParams.publishingTrackId',
      userId: 'userId',
      networkName: null,
      networkPort: 0,
      isPublic: false,
      setProperty: 'pubNetworkElementInstance'
    },

    destElementProps = {
      elementInstanceId: 'bodyParams.destinationElementId',
      setProperty: 'destinationElementInstance'
    },

    destNetworkInstanceProps = {
      networkElement: 'destNetworkElement',
      fogInstanceId: 'destinationFogInstance.uuid',
      satellitePort: 'satellitePort.port1',
      satelliteDomain: 'satellite.domain',
      trackId: 'bodyParams.publishingTrackId',
      userId: 'userId',
      networkName: null,
      networkPort: 0,
      isPublic: false,
      setProperty: 'destNetworkElementInstance'
    },

    pubChangeTrackingProps = {
      fogInstanceId: 'publishingFogInstance.uuid',
      changeObject: {
        'containerList': currentTime,
        'containerConfig': currentTime,
        'routing': currentTime
      }
    },

    destChangeTrackingProps = {
      fogInstanceId: 'destinationFogInstance.uuid',
      changeObject: {
        'containerList': currentTime,
        'containerConfig': currentTime,
        'routing': currentTime
      }
    },

    trackProps = {
      trackId: 'destinationElementInstance.trackId',
      setProperty: 'dataTrack'
    };

  params.bodyParams = req.body;

  if (params.bodyParams.publishingInstanceId == params.bodyParams.destinationInstanceId) {
    watefallMethods = [
      async.apply(UserService.getUser, userProps, params),

      async.apply(FabricService.getFogInstance, pubFogProps),
      async.apply(FabricService.getFogInstance, destFogProps),

      async.apply(ElementInstanceService.getElementInstance, destElementProps),

      async.apply(RoutingService.createRoute, routingProps),

      async.apply(ElementInstanceService.updateRebuild, pubElementProps),
      async.apply(ElementInstanceService.updateRebuild, destElementProps),

      async.apply(ChangeTrackingService.updateChangeTracking, pubChangeTrackingProps),

      async.apply(DataTracksService.getDataTrackById, trackProps),

      getOutputDetails
    ];
  } else {
    watefallMethods = [
      async.apply(UserService.getUser, userProps, params),

      async.apply(FabricService.getFogInstance, pubFogProps),
      async.apply(FabricService.getFogInstance, destFogProps),

      async.apply(FabricTypeService.getFabricTypeDetail, pubFogTypeProps),
      async.apply(FabricTypeService.getFabricTypeDetail, destFogTypeProps),

      async.apply(ElementInstanceService.getElementInstance, pubElementProps),
      async.apply(ElementInstanceService.getElementInstance, destElementProps),

      ComsatService.openPortOnRadomComsat,
      SatellitePortService.createSatellitePort,

      async.apply(ElementService.getNetworkElement, pubNetworkElementProps),
      async.apply(ElementInstanceService.createNetworkElementInstance, pubNetworkInstanceProps),

      async.apply(ElementService.getNetworkElement, destNetworkElementProps),
      async.apply(ElementInstanceService.createNetworkElementInstance, destNetworkInstanceProps),

      async.apply(NetworkPairingService.createNetworkPairing, networkPairingProps),

      async.apply(RoutingService.createRoute, pubRoutingProps),
      async.apply(RoutingService.createRoute, destRoutingProps),

      async.apply(ElementInstanceService.updateRebuild, pubElementProps),
      async.apply(ElementInstanceService.updateRebuild, destElementProps),

      async.apply(ChangeTrackingService.updateChangeTracking, pubChangeTrackingProps),
      async.apply(ChangeTrackingService.updateChangeTracking, destChangeTrackingProps),

      async.apply(DataTracksService.getDataTrackById, trackProps),

      getOutputDetails
    ];
  }

  async.waterfall(watefallMethods, function(err, result) {
    var errMsg = 'Internal error: There was a problem trying to create the ioElement Routing.' + result;

    AppUtils.sendResponse(res, err, 'route', params.output, errMsg);
  });
});

const getOutputDetails = function(params, callback) {
  params.output = {
    elementId: params.bodyParams.destinationElementId,
    elementName: params.destinationElementInstance.name,
    elementTypeName: params.destinationElementInstance.typeKey,
    trackId: params.destinationElementInstance.trackId,
    trackName: params.dataTrack.name,
    instanceId: params.destinationFogInstance.uuid,
    instanceName: params.destinationFogInstance.name
  };

  callback(null, params);
}

router.post('/api/v2/authoring/element/instance/route/delete', (req, res) => {
  var params = {},
    currentTime = new Date().getTime(),
    watefallMethods = [],

    userProps = {
      userId: 'bodyParams.userId',
      setProperty: 'user'
    },

    pubFogProps = {
      fogId: 'bodyParams.publishingInstanceId',
      setProperty: 'publishingFogInstance'
    },

    destFogProps = {
      fogId: 'bodyParams.destinationInstanceId',
      setProperty: 'destinationFogInstance'
    },

    deleteRouteProps = {
      instanceId1: 'bodyParams.publishingInstanceId',
      instanceId2: 'bodyParams.publishingInstanceId',
      elementId1: 'bodyParams.publishingElementId',
      elementId2: 'bodyParams.destinationElementId',
      isNetwork: false
    },

    networkPairingProps = {
      instanceId1: 'bodyParams.publishingInstanceId',
      instanceId2: 'bodyParams.destinationInstanceId',
      elementId1: 'bodyParams.publishingElementId',
      elementId2: 'bodyParams.destinationElementId',
      setProperty: 'networkPairing'
    },

    satellitePortProps = {
      satellitePortId: 'networkPairing.satellitePortId',
      setProperty: 'satellitePort'
    },

    satelliteProps = {
      satelliteId: 'satellitePort.satellite_id',
      setProperty: 'satellite'
    },

    deleteSatelliteProps = {
      satellitePortId: 'satellitePort.id'
    },

    deletePubRouteProps = {
      instanceId1: 'bodyParams.publishingInstanceId',
      instanceId2: 'bodyParams.publishingInstanceId',
      elementId1: 'bodyParams.publishingElementId',
      elementId2: 'networkPairing.networkElementId1',
      isNetwork: true
    },

    deleteDestRouteProps = {
      instanceId1: 'bodyParams.destinationInstanceId',
      instanceId2: 'bodyParams.destinationInstanceId',
      elementId1: 'networkPairing.networkElementId2',
      elementId2: 'bodyParams.destinationElementId',
      isNetwork: true
    },

    deleteNWElement1Props = {
      elementId: 'networkPairing.networkElementId1'
    },

    deleteNWElement2Props = {
      elementId: 'networkPairing.networkElementId2'
    },

    delNetworkPairingProps = {
      networkPairingId: 'networkPairing.id'
    },

    pubChangeTrackingProps = {
      fogInstanceId: 'bodyParams.publishingInstanceId',
      changeObject: {
        'containerList': new Date().getTime(),
        'containerConfig': new Date().getTime(),
        'Routing': new Date().getTime()
      }
    },

    destChangeTrackingProps = {
      fogInstanceId: 'bodyParams.destinationInstanceId',
      changeObject: {
        'containerList': new Date().getTime(),
        'containerConfig': new Date().getTime(),
        'Routing': new Date().getTime()
      }
    };

  params.bodyParams = req.body;

  if (params.bodyParams.isNetworkConnection == 0) {
    watefallMethods = [
      async.apply(UserService.getUser, userProps, params),
      async.apply(RoutingService.deleteByFogAndElement, deleteRouteProps),
      getDeleteOutput
    ];
  } else {
    watefallMethods = [
      async.apply(UserService.getUser, userProps, params),

      async.apply(FabricService.getFogInstance, pubFogProps),
      async.apply(FabricService.getFogInstance, destFogProps),

      async.apply(NetworkPairingService.getNetworkPairingByFogAndElement, networkPairingProps),

      async.apply(SatellitePortService.getSatellitePort, satellitePortProps),
      async.apply(SatelliteService.getSatelliteById, satelliteProps),
      ComsatService.closePortOnComsat,

      async.apply(SatellitePortService.deleteSatellitePort, deleteSatelliteProps),

      async.apply(RoutingService.deleteByFogAndElement, deletePubRouteProps),
      async.apply(RoutingService.deleteByFogAndElement, deleteDestRouteProps),

      async.apply(ElementInstanceService.deleteElementInstance, deleteNWElement1Props),
      async.apply(ElementInstanceService.deleteElementInstance, deleteNWElement2Props),

      async.apply(NetworkPairingService.deleteNetworkPairingById, delNetworkPairingProps),

      async.apply(ChangeTrackingService.updateChangeTracking, pubChangeTrackingProps),
      async.apply(ChangeTrackingService.updateChangeTracking, destChangeTrackingProps),

      getDeleteOutput
    ];
  }

  async.waterfall(watefallMethods, function(err, result) {
    var errMsg = 'Internal error: There was a problem trying to delete the ioElement Routing.' + result;

    AppUtils.sendResponse(res, err, 'route', params.output, errMsg);
  });
});

const getDeleteOutput = function(params, callback) {
  params.output = {
    publishinginstanceid: params.bodyParams.publishingInstanceId,
    publishingtrackid: params.bodyParams.publishingTrackId,
    publishingelementid: params.publishingElementInstanceId,
    destinationinstanceid: params.bodyParams.destinationInstanceId,
    destinationtrackid: params.bodyParams.destinationTrackId,
    destinationelementid: params.bodyParams.destinationElementId
  };

  callback(null, params);
}

export default router;