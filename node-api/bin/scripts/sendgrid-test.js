const sendgrid = require('../../src/lib/sendgrid');
const { formatCurrency } = require('../../src/lib/utils');
const moment = require('moment');


//cf1 -> collection funnel 1 => sendgrid template id
const emailMap = {
  cf1: 'dc7fd864-d26a-437f-8fad-2ddde0d1bb51',
  // cf2: 'b5171cfd-fefe-4c0f-9f29-830e9a98c7e7',
  // cf3: '9fcc0b1e-1d9c-4f76-8e33-267344b4d064',
  // cf4: '69139367-22f9-419d-b857-152158e29b94',
  // cf5: '8fe17833-4a88-4f87-80db-f229ae053096',
};

async function myTest(user, template_id, cid) {
  const advance = {
    advanceId: 1,
    amount: 891,
    created: moment()
  };

  const substitutions = {
    FIRSTNAME: user.firstName,
    ADVANCE_AMOUNT: formatCurrency(advance.amount, 2),
    ADVANCE_DATE: moment(advance.created).format('MMMM D, YYYY'),
    PAYMENT_URL: 'https://dave.com/m/payment'
  };

  console.log(user);
  console.log(template_id);
  console.log(substitutions);

  try {
    const z = await sendgrid.send(
      'Hi, I\'m testing this',
      template_id,
      substitutions,
      user.email,
      customArgs = {
        cid,
        user_email: user.email,
        advance_id: `${advance.advanceId}`, // using numbers in custom_args breaks sendgrid
        template_id,
        uid: `${user.id}`
      }
    );

    console.log(z);
  } catch (e) {
    console.error('error');
    console.error(e);
    console.error('-------');

    console.error(e.response.body);
  }
}

const user = {
  id: 1,
  firstName: 'Nick',
  lastName: 'Weinberg',
  email: 'nick@dave.com',
};

async function okok() {
  const advance = {
    advanceId: 1,
    amount: 891,
    created: moment()
  };

  const substitutions = {
    FIRSTNAME: user.firstName,
    ADVANCE_AMOUNT: formatCurrency(advance.amount, 2),
    ADVANCE_DATE: moment(advance.created).format('MMMM D, YYYY'),
    PAYMENT_URL: 'https://dave.com/m/payment'
  };

  const r = await sendgrid.send(
    'test',
    'dc7fd864-d26a-437f-8fad-2ddde0d1bb51',
    substitutions,
    'nick@dave.com',
    customArgs = {
      cid: 'test1',
      user_email: 'nick@dave.com',
      advance_id: '180', // using numbers in custom_args breaks sendgrid
      template_id: 'test-template',
      uid: '1'
    }
  );
}

// Object.keys(emailMap).forEach((key) => {
//   console.log('Sending: ', key);
//   myTest(user, emailMap[key], key);
// });

myTest(user, emailMap.cf1, 'cf1');
// console.log(user, emailMap['cf1']);
// okok();

