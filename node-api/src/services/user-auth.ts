import * as PromiseRouter from 'express-promise-router';
import { Router } from 'express';
import { Response } from 'express';
import { IDaveRequest } from '../typings';
import requireAuth from '../middleware/require-auth';
import { SynapsepayDocument } from '../models';

export const authRouter: Router = PromiseRouter();

async function auth(req: IDaveRequest, res: Response): Promise<Response> {
  const deviceId = req.get('X-Device-Id');
  const deviceType = req.get('X-Device-Type');
  const [userSession, doc] = await Promise.all([
    req.user.getSession(deviceId, deviceType),
    SynapsepayDocument.findOne({ where: { userId: req.user.id } }),
  ]);

  return res.send({
    id: req.user.id,
    legacyId: req.user.legacyId,
    email: req.user.email,
    phoneNumber: req.user.phoneNumber,
    firstName: req.user.firstName,
    lastname: req.user.lastName,
    birthdate: req.user.birthdate,
    addressLine1: req.user.addressLine1,
    addressLine2: req.user.addressLine2,
    city: req.user.city,
    state: req.user.state,
    zipCode: req.user.zipCode,
    synapseUserId: req.user.synapsepayId,
    synapseDocumentId: doc && doc.synapsepayDocId,
    emailVerified: req.user.emailVerified,
    roles: req.user.roles.map(r => r.name),
    adminLoginOverride: userSession.adminLoginOverride,
  });
}

authRouter.get('/', requireAuth, auth);
