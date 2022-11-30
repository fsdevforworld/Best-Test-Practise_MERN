import { sequelize } from '../../src/models';
import * as Bluebird from 'bluebird';

const upSql = `INSERT INTO synapsepay_document
  (id, user_id, synapsepay_user_id, user_notified, email, day, month, year, address_street, address_city, address_subdivision, address_postal_code, permission, ip, phone_number, ssn_status, ssn, name, synapsepay_doc_id, license_status)
  VALUES
  (3, 3, 3, true, '3@dave.com', 1, 1, 1980, '123 Main St', 'Los Angeles', 'CA', '90019', 'SEND-AND-RECEIVE', '127.0.0.1', '+11000000003', 'VALID', 'ABC', 'David Tennant', '3', NULL),
  (31, 31, 31, true, '31@dave.com', 1, 1, 1980, '123 Main St', 'Los Angeles', 'CA', '90019', 'SEND-AND-RECEIVE', '127.0.0.1', '+11000000031', 'VALID', 'ABC', 'Dave 31', '31', NULL),
  (200, 200, 200, true, '200@dave.com', 1, 1, 1980, '200', 'City', 'ST', '00200', 'SEND-AND-RECEIVE', '200.0.0.0', '+11000000200', 'VALID', 'ABC', 'Dave 200', '200', NULL),
  (900, 900, 900, true, '900@dave.com', 1, 1, 1980, '900', 'City', 'ST', '00900', 'SEND-AND-RECEIVE', '900.0.0.0', '+11000000900', 'VALID', 'ABC', 'Dave 900', '900', NULL),
  (901, 901, 901, true, '901@dave.com', 1, 1, 1980, '901', 'City', 'ST', '00901', 'UNVERIFIED', '901.0.0.0', '+11000000901', 'INVALID', 'ABC', 'Dave 901', '901', NULL),
  (1000, 1000, 1000, true, '1000@dave.com', 1, 1, 1980, '1000', 'City', 'ST', '00901', 'LOCKED', '1000.0.0.0', '+11000001000', 'INVALID', 'ABC', 'Dave 1000', '1000', 'VALID');
  `;

function up(): Bluebird<any> {
  return sequelize.query(upSql);
}

export default { up, tableName: 'synapsepay_document', upSql };
