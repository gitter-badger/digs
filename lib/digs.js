'use strict';

let DigsEmitter = require('./common/digs-emitter'),
  Promise = require('bluebird'),
  mqttServer = require('./common/mqtt/server'),
  _ = require('./common/lodash-mixins'),

  Board = require('./board/board'),
  pkg = require('../package.json');

const NAME = pkg.name;

let debug = require('debug')('digs:models:brickhouse'),
  getPort = Promise.promisify(require('get-port'));

/**
 * Configuration object for a Board and its components.
 * @summary Board Definition
 * @typedef {Object} BoardDef
 */

/**
 * Plugin class
 */
class Digs extends DigsEmitter {

  /**
   * Instantiates Digs plugin; configures Board(s) for use
   * @param {Hapi.Server} server Hapi server instance
   * @param {(Object.<string,BoardDef>|Array.<BoardDef>)} opts Board Definition
   *     objects; keyed on ID, or an Array
   * @constructor
   */
  constructor(server, opts) {
    super(server);

    /**
     * Plugin Configuration
     * @type {Object}
     */
    this.opts = opts || {};

    debug('Received opts', opts);

    /**
     * Mapping of {@link Board} {@link Board#id Board ID's} to Boards.
     * @type {Object.<string,Board>}
     */
    this.boards = _(this.opts.boards || {})
      .pick(function (value) {
        return _.isObject(value) && value !== '_' && !_.isArray(value) &&
          !_.isFunction(value);
      })
      .tap(function (value) {
        debug('Found raw board config %j', value);
      })
      .map(this.createBoard, this)
      .indexBy('id')
      .value();

    this.mqttServer = mqttServer(opts.mqtt);

    debug('Instantiated Digs plugin with options:', this.opts);
  }

  /**
   * Bootstraps a {@link Board} from a {@link BoardDef Board Definition}
   * @param {BoardDef} opts Board Definition
   * @param {?string} [id] Unique ID of board, if string
   * @returns {Board} New Board instance
   */
  createBoard(opts, id) {
    let board,
      self = this,
      server = this.server;

    debug('Digs#createBoard called with ID "%s" and opts:', id, opts);

    id = opts.id = (_.isString(id) && id) || opts.id || null;

    board = new Board(server, this, opts)
      .on('error', function (err) {
        self.emit('error', err);
      })
      .on('ready', function () {
        self.info('Board "%s" is ready on port "%s"', this.id, this.port);
        self.emit('ready', this);
      });

    server.on('stop', function () {
      board.stop();
    });

    self.info('Created board with ID "%s"', id);

    return board;
  }

  /**
   * Starts a Board.
   * @param {(Board|BoardDef|string)} [board] Board object, Board
   *     Definition, or Board ID.  If omitted, starts all Boards.
   * @param {string} [id] ID of Board, if `board` is a Board Definition.
   * @return {(Promise.<Board>|Promise.<Array.<Board>>)} Ready Board(s)
   */
  start(board, id) {
    if (_.isUndefined(board)) {
      debug('Starting all Boards (%d)', _.size(this.boards));
      return Promise.settle(_.map(this.boards, function (boardObj) {
        return boardObj.start()
          .bind(this)
          .catch(function (err) {
            this.warn(err);
          });
      }, this));
    }
    else if (_.isString(board)) {
      board = this.boards[board];
    }
    else if (!(board instanceof Board)) {
      board = this.createBoard(board, id);
      this.boards[board.id] = board;
    }
    debug('Starting board "%s"', board.id);
    return board.start();
  }
}

Digs.NAME = NAME;

module.exports = Digs;