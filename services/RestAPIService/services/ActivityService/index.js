const _ = require('lodash');

class ActivityService {
  /**
   * @param  {Object} params
   * @param  {Object} params.messaging
   * @param  {Object} params.constantsEvents
   */
  constructor({
    messaging, constantsEvents, activityHistoryConstants, restAPIConstants,
    memory, phase,
  }) {
    this.messaging = messaging;
    this.constantsEvents = constantsEvents;
    this.activityHistoryConstants = activityHistoryConstants;
    this.restAPIConstants = restAPIConstants;
    this.memory = memory;
    this.phase = phase;
  }

  /**
   * @param  {Object} req
   * @param  {Object} res
   */
  drainActivity(req, res) {
    const { messaging, constantsEvents } = this;

    messaging.emitActivityHistoryMessage({ systemEvent: constantsEvents.DRAIN_REDIS_TO_ELASTIC });
    res.end('Redis was drained');
  }


  /**
   * @param  {Object} req
   * @param  {Object} res
   */
  externalTrackPoint(req, res) {
    const { INVALID_REQUEST_BODY, BAD_REQUEST } = this.restAPIConstants;
    const data = _.get(req, 'body', {});

    if (data.uid) Object.assign(data, this.memory.uid.getIds(data.uid));
    const {
      point, pointInfo, pointSource: externalIndexPrefix, sessionHash, channel,
      uid, projectId, viewerId, userId, timestamp,
    } = data;
    const missingFields = _.remove(
      [
        sessionHash,
        (viewerId || userId),
        projectId,
        point,
        externalIndexPrefix,
        channel,
        timestamp,
      ],
      v => !v
    );

    if (!missingFields.length) {
      const { messaging } = this;
      const message = {
        sessionHash,
        externalIndexPrefix,
        point,
        pointInfo,
        timestamp,
        uid: uid || `${(viewerId || userId)}_${projectId}`,
        channel,
        activityName: point,
        phase: this.phase.create({ point }),
      };

      messaging.emitActivityHistoryMessage(message);
      return res.end(JSON.stringify({ message: 'tracked' }));
    }
    res.writeHead(BAD_REQUEST);
    return res.end(JSON.stringify({ message: INVALID_REQUEST_BODY }));
  }

  /**
   * @param  {Object} req
   * @param  {Object} res
   */
  trackPoint(req, res) {
    const { projectId, viewerId, sessionHash } = req.body;

    if (!sessionHash || !projectId || !viewerId) {
      const { INVALID_REQUEST_BODY, BAD_REQUEST } = this.restAPIConstants;

      res.writeHead(BAD_REQUEST);
      return res.end(JSON.stringify({ message: INVALID_REQUEST_BODY }));
    }

    const { messaging, activityHistoryConstants } = this;
    const { group, type, subType, point, timestamp, pointInfo } = req.body;
    const message = {
      sessionHash,
      group,
      point,
      pointInfo,
      subType,
      timestamp,
      type,
      uid: `${viewerId}_${projectId}`,
      channel: activityHistoryConstants.channel.SERVER,
      activityName: point,
    };

    messaging.emitActivityHistoryMessage(message);
    res.end(JSON.stringify({ message }));
  }
}

module.exports = ActivityService;
