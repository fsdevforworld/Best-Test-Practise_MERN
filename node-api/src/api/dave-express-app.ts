import { isDevEnv, isProdEnv, isTestEnv, startDebugger } from '../lib/utils';
import * as express from 'express';
import { Response } from 'express';
import * as debugAgent from '@google-cloud/debug-agent';
import * as config from 'config';
import * as expressWinston from 'express-winston';
import * as winston from 'winston';
import { IDaveRequest } from '../typings';
import logger from '../lib/logger';
import { Server } from 'http';
import corsMiddleware from '../middleware/cors';
import { errorHandlerMiddleware, errorMungerMiddleware } from '../middleware/error';
import { NextFunction } from 'express-serve-static-core';
// tslint:disable-next-line:no-require-imports
import connectDatadog = require('connect-datadog');
// tslint:disable-next-line:no-require-imports
import stoppable = require('stoppable');

let dataDog: any;

/**
 * Creates an express app with all common Dave middleware.
 *
 * @param configure A function to setup all routes and any additional middleware.
 * @param serviceName The name of the service used for logging and datadog metrics.
 * @param port The port to start the service on.
 */
export default function createDaveExpressApp(
  configure: (app: express.Express) => void,
  serviceName: string,
  port: number = 8080,
): express.Express {
  const app = express();
  setupProductionDebugTools(serviceName);
  setupPreServiceMiddleware(app);
  configure(app);
  setupPostServiceMiddleware(app);
  const server = startServer(app, port);
  setupGracefulShutdown(server);

  return app;
}

function setupPreServiceMiddleware(app: express.Express) {
  setupRequestLogging(app);
  app.set('trust proxy', true);
  app.use(corsMiddleware);
  if (dataDog) {
    app.use(dataDog);
  }
  initRootRoutes(app);
}

function setupPostServiceMiddleware(app: express.Express) {
  app.use(errorMungerMiddleware);
  app.use(errorHandlerMiddleware);
}

function startServer(app: express.Express, port: number): Server {
  return app.listen(port, () => {
    /* istanbul ignore next */
    if (isDevEnv()) {
      logger.info(`Listening on http://localhost:${port}`);
    } else if (isProdEnv()) {
      logger.info('Node API started');
    }
  });
}

function initRootRoutes(app: express.Express) {
  app.get('/', (req, res) => {
    if (isProdEnv()) {
      res.send({ ok: true });
    } else {
      const deploymentInfo = config.get<object>('deploymentInfo');
      res.send({
        ok: true,
        ...deploymentInfo,
      });
    }
  });
}

function setupProductionDebugTools(serviceName: string) {
  startDebugger(debugAgent, serviceName);
  if (config.get('datadog.enabled')) {
    dataDog = connectDatadog({
      response_code: true,
      tags: [`app:${serviceName}`],
    });
  }
}

function setupWinstonLogging(app: express.Express) {
  if (isDevEnv()) {
    expressWinston.requestWhitelist.push('body');
    app.use(
      expressWinston.logger({
        transports: [
          new winston.transports.Console({
            json: true,
            colorize: true,
          }),
        ],
        meta: true,
        msg: 'HTTP {{req.method}} {{req.url}}',
        expressFormat: true,
      }),
    );
  }
}

function setupRequestLogging(app: express.Express) {
  setupWinstonLogging(app);
  app.use((req: IDaveRequest, res: Response, next: NextFunction) => {
    /* istanbul ignore next */
    if (!isTestEnv() && req.url !== '/') {
      const startTime = new Date();
      logger.debug('requestStart', {
        ...getCommonRequestLogData(req),
        logType: 'requestStart',
      });
      res.on('finish', () => {
        const endTime = new Date();
        const requestData = getCommonRequestLogData(req);
        const logMessage = `${requestData.method} ${requestData.endpoint}`;
        const logPayload = {
          ...requestData,
          originalUrl: req.originalUrl,
          status: res.statusCode,
          duration: endTime.getTime() - startTime.getTime(),
          logType: 'requestFin',
        };
        if (res.statusCode >= 500) {
          logger.error(logMessage, logPayload);
        } else {
          logger.info(logMessage, logPayload);
        }
      });
    }
    next();
  });
}

function getCommonRequestLogData(req: IDaveRequest) {
  return {
    requestID: req.get('X-Request-Id') || req.requestID,
    ip: req.ip,
    connectionIp: req.connection.remoteAddress,
    method: req.method,
    url: req.url,
    userId: req.user && req.user.id,
    query: req.query,
    headers: req.headers,
    endpoint: req.route ? req.route.path : req.originalUrl,
  };
}

function setupGracefulShutdown(server: Server) {
  const decoratedServer = stoppable(server);

  function gracefulShutdown() {
    logger.info('Shutting down server');
    decoratedServer.stop((err: any) => {
      if (err) {
        logger.error('Error happened during graceful shutdown', { err });
        process.exit(1);
      }

      process.exit(0);
    });
  }

  process.on('SIGTERM', gracefulShutdown);
}
