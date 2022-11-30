import IPromotionRedemption from './i-promotion-redemption-resource';
import IReferralResource from './i-referral-resource';
import IUserPromotionResource from './i-user-promotion-resource';
import serializeEmailVerification, {
  IEmailVerificationResource,
} from './serialize-email-verification';
import serializePromotionRedemption from './serialize-promotion-redemption';
import serializeReferral from './serialize-referral';
import serializeRole, { IRoleResource } from './serialize-role';
import serializeUser, { IUserResource } from './serialize-user';
import serializeUserPromotion from './serialize-user-promotion';

export {
  IEmailVerificationResource,
  IPromotionRedemption,
  IReferralResource,
  IRoleResource,
  IUserPromotionResource,
  IUserResource,
  serializeEmailVerification,
  serializePromotionRedemption,
  serializeReferral,
  serializeRole,
  serializeUser,
  serializeUserPromotion,
};
