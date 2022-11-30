import {
  BLOB,
  BOOLEAN,
  DECIMAL,
  ENUM,
  FindOptions,
  INTEGER,
  JSON as SQLJSON,
  STRING,
} from 'sequelize';
import {
  BelongsTo,
  Column,
  CreatedAt,
  DeletedAt,
  ForeignKey,
  Model,
  Table,
  UpdatedAt,
} from 'sequelize-typescript';

import {
  SynapsepayDocumentLicenseStatus,
  SynapsepayDocumentPermission,
  SynapsepayDocumentSSNStatus,
} from '../typings';
import User from './user';
import { Moment } from 'moment';
import { DehydratedBaseDocument } from 'synapsepay';
import { InvalidParametersError } from '../lib/error';

@Table({
  tableName: 'synapsepay_document',
})
export default class SynapsepayDocument extends Model<SynapsepayDocument> {
  @Column({
    autoIncrement: true,
    primaryKey: true,
    type: INTEGER,
  })
  public id: number;

  @ForeignKey(() => User)
  @Column({
    field: 'user_id',
    type: INTEGER,
  })
  public userId: number;

  @BelongsTo(() => User)
  public user: User;
  public getUser: (options?: FindOptions) => Promise<User>;

  @Column({
    field: 'synapsepay_user_id',
    type: STRING(256),
  })
  public synapsepayUserId: string;

  @Column({
    field: 'user_notified',
    type: BOOLEAN,
  })
  public userNotified: boolean;

  @Column({
    field: 'email',
    type: STRING(256),
  })
  public email: string;

  @Column({
    field: 'day',
    type: STRING(256),
  })
  public day: string;

  @Column({
    field: 'month',
    type: STRING(256),
  })
  public month: string;

  @Column({
    field: 'year',
    type: STRING(256),
  })
  public year: string;

  @Column({
    field: 'address_street',
    type: STRING(256),
  })
  public addressStreet: string;

  @Column({
    field: 'address_city',
    type: STRING(256),
  })
  public addressCity: string;

  @Column({
    field: 'address_subdivision',
    type: STRING(256),
  })
  public addressSubdivision: string;

  @Column({
    field: 'address_postal_code',
    type: STRING(256),
  })
  public addressPostalCode: string;

  @Column({
    field: 'permission',
    type: ENUM('UNVERIFIED', 'SEND-AND-RECEIVE', 'LOCKED', 'MAKE-IT-GO-AWAY', 'CLOSED'),
  })
  public permission: SynapsepayDocumentPermission;

  @Column({
    field: 'ip',
    type: STRING(256),
  })
  public ip: string;

  @Column({
    field: 'phone_number',
    type: STRING(256),
  })
  public phoneNumber: string;

  @Column({
    field: 'ssn_status',
    type: ENUM('REVIEWING', 'VALID', 'INVALID', 'BLACKLIST'),
  })
  public ssnStatus: SynapsepayDocumentSSNStatus;

  @Column({
    field: 'ssn',
    type: STRING(256),
  })
  public ssn: string;

  @Column({
    field: 'license',
    type: BLOB('medium'),
  })
  public license: Buffer;

  @Column({
    field: 'license_status',
    type: ENUM('REVIEWING', 'VALID', 'INVALID'),
  })
  public licenseStatus: SynapsepayDocumentLicenseStatus;

  @Column({
    field: 'name',
    type: STRING(256),
  })
  public name: string;

  @Column({
    field: 'synapsepay_doc_id',
    type: STRING(256),
  })
  public synapsepayDocId: string;

  @Column({
    field: 'sanctions_screening_match',
    type: BOOLEAN,
  })
  public sanctionsScreeningMatch: boolean;

  @Column({
    field: 'watchlists',
    type: STRING(256),
  })
  public watchlists: string;

  @Column({
    field: 'flag',
    type: STRING(256),
  })
  public flag: string;

  @Column({
    field: 'flag_code',
    type: STRING(256),
  })
  public flagCode: string;

  @Column({
    field: 'permission_code',
    type: STRING(256),
  })
  public permissionCode: string;

  @Column({
    field: 'id_score',
    type: DECIMAL(3, 2),
  })
  public idScore: number;

  @Column({
    type: SQLJSON,
  })
  public extra: unknown;

  @DeletedAt
  public deleted: Moment;

  @CreatedAt
  public created: Moment;

  @UpdatedAt
  public updated: Moment;

  public async updateSanctionsScreening(data: DehydratedBaseDocument) {
    const { screening_results: screeningResults } = data;

    if (!screeningResults) {
      throw new InvalidParametersError('Synapse document did not include screening_results');
    }

    const isMatch = Object.values(screeningResults).some(result => result === 'MATCH');

    await this.update({ sanctionsScreeningMatch: isMatch });

    return this;
  }
}
