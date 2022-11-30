import logger from '../../src/lib/logger';
import { User } from '../../src/models';
import { Op, QueryTypes } from 'sequelize';
import { sequelize } from '../../src/models';

import { sampleSize, random } from 'lodash';
import * as Bluebird from 'bluebird';

// Randomly generated data for testing
const generatedPhoneNumbersList = [
  '+10789434851',
  '+13644807517',
  '+12942841679',
  '+13650870458',
  '+12039539670',
  '+14073709475',
  '+19194986392',
  '+19518641732',
  '+10116363675',
  '+16037948684',
  '+18462443988',
  '+19350641130',
  '+10483397876',
  '+11432669162',
  '+13655518953',
  '+17393417813',
  '+19575066782',
  '+19206950962',
  '+18444300680',
  '+13466998736',
  '+12615991387',
  '+15224123402',
  '+11294496676',
  '+13710945810',
  '+19579130341',
  '+16268183803',
  '+17079633652',
  '+13740997375',
  '+16252380178',
  '+13021390898',
  '+10152618859',
  '+15507756475',
  '+15551298957',
  '+13729456240',
  '+16241515017',
  '+11627052088',
  '+15059043873',
  '+17963575612',
  '+11664931012',
  '+18789447394',
  '+18431004637',
  '+14626677303',
  '+12295406023',
  '+18532430629',
  '+14222661746',
  '+13192326596',
  '+10272756954',
  '+14950301828',
  '+19011174965',
  '+12705912557',
  '+12935805406',
  '+16742556242',
  '+14884848309',
  '+17780171076',
  '+17002178482',
  '+13310388289',
  '+16923763716',
  '+17150485438',
  '+15918498546',
  '+15102390782',
  '+11815817341',
  '+13888661213',
  '+15017006759',
  '+19386361986',
  '+16868930462',
  '+13828781198',
  '+18894504112',
  '+14815570793',
  '+12072980227',
  '+17293384825',
  '+13599818786',
  '+15868405557',
  '+12360268665',
  '+11076446792',
  '+10748097906',
  '+11823109249',
  '+14250759468',
  '+13650426380',
  '+18673496730',
  '+11094117295',
  '+15543663085',
  '+14657218895',
  '+12041434919',
  '+18629501509',
  '+13792774005',
  '+11713115788',
  '+13009772877',
  '+16607269650',
  '+10824279681',
  '+11230422827',
  '+18424582997',
  '+12316915315',
  '+13769013527',
  '+13935399752',
  '+19518568754',
  '+11509052956',
  '+11950356743',
  '+15028190281',
  '+11740236858',
  '+16288629487',
  '+11431918277',
];

// Randomly generated data for testing
const generatedEmailList = [
  'Ike.Cole@gmail.com',
  'Cary_Reichert@yahoo.com',
  'Jess38@yahoo.com',
  'Erica.Langworth5@yahoo.com',
  'Lily56@gmail.com',
  'Trystan.Lebsack@gmail.com',
  'Riley.Roob58@hotmail.com',
  'Katelynn88@hotmail.com',
  'Mikayla66@gmail.com',
  'Roma_Cummings44@yahoo.com',
  'Holly_Hodkiewicz69@yahoo.com',
  'Lila_Bode47@hotmail.com',
  'Remington.Parker72@hotmail.com',
  'Elody94@hotmail.com',
  'Llewellyn_Runolfsson@yahoo.com',
  'Blaise_Botsford@yahoo.com',
  'Jamie.Kutch54@yahoo.com',
  'Moriah.Bradtke@gmail.com',
  'Wilhelm_Stroman@hotmail.com',
  'Rod58@gmail.com',
  'Bernice_OReilly25@hotmail.com',
  'Jeanne.Altenwerth@gmail.com',
  'Maryse_Cartwright@hotmail.com',
  'Wendell80@yahoo.com',
  'Armani_Lubowitz97@hotmail.com',
  'Nelle.Barrows@yahoo.com',
  'Minerva.Oberbrunner26@yahoo.com',
  'Newell19@hotmail.com',
  'Bernice.Collier46@gmail.com',
  'Deja_Ziemann@hotmail.com',
  'Willie.Effertz@gmail.com',
  'Aletha91@gmail.com',
  'Salma20@yahoo.com',
  'Rickie.Bartoletti52@yahoo.com',
  'Claudie67@gmail.com',
  'Ciara_Lynch@hotmail.com',
  'Nicole81@yahoo.com',
  'Janelle45@yahoo.com',
  'Noemy.Farrell31@gmail.com',
  'Sim_Steuber@hotmail.com',
  'Billy.Renner@gmail.com',
  'Myrtie57@yahoo.com',
  'Ayana_Vandervort91@hotmail.com',
  'Destini.Cummings@hotmail.com',
  'Sharon.Glover14@gmail.com',
  'Neha.Medhurst@gmail.com',
  'Jessyca.Sipes@yahoo.com',
  'Andre.Effertz@hotmail.com',
  'Maybelle72@hotmail.com',
  'Ciara.Steuber@hotmail.com',
  'Genesis.Russel6@yahoo.com',
  'Juliet.Thiel@yahoo.com',
  'Norberto.Baumbach@yahoo.com',
  'Luisa.Harris2@yahoo.com',
  'Alphonso_Grant@yahoo.com',
  'Laury.Johnston@hotmail.com',
  'Gardner44@gmail.com',
  'Brooke.Parisian@gmail.com',
  'Sasha.Strosin@hotmail.com',
  'Asia.Terry92@hotmail.com',
  'Mary.Farrell@hotmail.com',
  'Ernesto_Price@yahoo.com',
  'Eleanore_Kohler83@hotmail.com',
  'Adrianna_Jerde99@gmail.com',
  'Chelsie_Doyle@gmail.com',
  'Rickie_Zboncak@gmail.com',
  'Halle45@hotmail.com',
  'Dashawn_Kub@hotmail.com',
  'Telly.Turner84@yahoo.com',
  'Destini.Adams@gmail.com',
  'Reba.Lueilwitz@hotmail.com',
  'Ahmad.Gutkowski@gmail.com',
  'Enola_Ondricka@yahoo.com',
  'Edgardo.Hand@gmail.com',
  'Eleanore.Morissette54@yahoo.com',
  'Willy.OConner@hotmail.com',
  'Nathanael69@gmail.com',
  'Damion7@gmail.com',
  'Newell.Emard@yahoo.com',
  'Rolando77@yahoo.com',
  'Rudolph_Welch17@yahoo.com',
  'Quinn.Blick@gmail.com',
  'Rebeca_Hegmann23@hotmail.com',
  'Romaine_Barton@yahoo.com',
  'Henderson_VonRueden@gmail.com',
  'Kavon_Reinger43@gmail.com',
  'Horace.Dach@hotmail.com',
  'Kevon.Rath@yahoo.com',
  'Ezequiel.Flatley61@hotmail.com',
  'Abe.Dickens5@yahoo.com',
  'Francesco_Gottlieb@hotmail.com',
  'Donnell.OConnell@yahoo.com',
  'Braden21@hotmail.com',
  'Ike.Paucek47@hotmail.com',
  'Mona.Cartwright@yahoo.com',
  'Jenifer_Wiegand47@yahoo.com',
  'Joesph.Balistreri85@gmail.com',
  'Caden.Stiedemann@gmail.com',
  'Derick22@yahoo.com',
  'Milford_Rau77@yahoo.com',
  'Christ_Spencer@gmail.com',
];

async function executeTestRun(
  {
    emailList,
    phoneNumberList,
  }: {
    emailList: string[];
    phoneNumberList: string[];
  },
  {
    concurrentQueries,
    minNumberSearchItems = 150,
    maxNumberSearchItems = 200,
    minDelay = 1000,
    maxDelay = 10000,
    useUnion = false,
  }: {
    concurrentQueries: number;
    minNumberSearchItems?: number;
    maxNumberSearchItems?: number;
    minDelay?: number;
    maxDelay?: number;
    useUnion?: boolean;
  },
) {
  logger.info('');
  logger.info(`######## Beginning test run with: \nConcurrent Queries: ${concurrentQueries}`);
  logger.info(`Union Query: ${useUnion ? 'yes' : 'no'}`);
  const testRun = [];

  for (let i = 0; i < concurrentQueries; i++) {
    const numberOfRandomPhoneNumbers = random(minNumberSearchItems, maxNumberSearchItems);
    const numberOfRandomEmails = random(minNumberSearchItems, maxNumberSearchItems);

    const randomPhoneNumbers = sampleSize(phoneNumberList, numberOfRandomPhoneNumbers);
    const randomEmailAddresses = sampleSize(emailList, numberOfRandomEmails);

    testRun.push({
      randomPhoneNumbers,
      randomEmailAddresses,
    });
  }

  let cumulativeRunTimeMs = 0;

  // Kick off these queries, with a between 1 and 10 second delay between each attempt, but kickoff each run
  // in parallel to simulate multiple users hitting the DB
  await Bluebird.map(testRun, async run => {
    // Introduce random delay
    await Bluebird.delay(random(minDelay, maxDelay));

    const start = process.hrtime();

    if (!useUnion) {
      const results = await User.findAll({
        where: {
          [Op.or]: {
            email: { [Op.in]: run.randomEmailAddresses },
            phoneNumber: { [Op.in]: run.randomPhoneNumbers },
          },
        },
      });
      logger.info(`Results returned: ${results.length}`);
    } else {
      const results = await sequelize.query(
        'SELECT * FROM user where email in (?) UNION SELECT * from user where phone_number in (?)',
        {
          type: QueryTypes.SELECT,
          replacements: [run.randomEmailAddresses, run.randomPhoneNumbers],
        },
      );

      logger.info(`Results returned: ${results.length}`);
    }
    const end = process.hrtime(start);

    // Time comes back in [seconds, nanoseconds], this converts both values to milliseconds
    const runTimeMs = end[0] * 1000 + end[1] * 0.000001;
    cumulativeRunTimeMs += runTimeMs;

    logger.info(`Execution time: ${runTimeMs}ms`);
  });

  logger.info(`######## End test run with: \nConcurrent Queries: ${concurrentQueries}`);
  logger.info(`Union Query: ${useUnion ? 'yes' : 'no'}`);
  logger.info(`Average query execution time: ${cumulativeRunTimeMs / testRun.length}ms`);
}

async function prepareData() {
  const existingData = await User.findAll({
    attributes: ['email', 'phoneNumber'],
    limit: 100,
  });

  const emailList = generatedEmailList.concat(existingData.map(x => x.email));
  const phoneNumberList = generatedPhoneNumbersList.concat(existingData.map(x => x.phoneNumber));

  return {
    emailList,
    phoneNumberList,
  };
}

async function main() {
  const processStart = process.hrtime();

  const testData = await prepareData();

  await executeTestRun(testData, {
    concurrentQueries: 100,
  });

  await executeTestRun(testData, {
    concurrentQueries: 100,
    useUnion: true,
  });

  // Introduce a delay in order to let real queries resolve in case this performs badly
  await Bluebird.delay(10000);

  await executeTestRun(testData, {
    concurrentQueries: 200,
  });

  await executeTestRun(testData, {
    concurrentQueries: 200,
    useUnion: true,
  });

  await Bluebird.delay(10000);

  await executeTestRun(testData, {
    concurrentQueries: 400,
  });

  await executeTestRun(testData, {
    concurrentQueries: 400,
    useUnion: true,
  });

  await Bluebird.delay(10000);

  await executeTestRun(testData, {
    concurrentQueries: 700,
  });

  await executeTestRun(testData, {
    concurrentQueries: 700,
    useUnion: true,
  });

  await Bluebird.delay(10000);

  await executeTestRun(testData, {
    concurrentQueries: 1000,
  });

  await executeTestRun(testData, {
    concurrentQueries: 1000,
    useUnion: true,
  });

  const processEnd = process.hrtime(processStart);
  logger.info(`Total Script Execution Time: ${processEnd[0]}s ${processEnd[1]}ns`);
}

main()
  .then(() => process.exit())
  .catch(error => {
    logger.error('Failed', { error });
    process.exit(1);
  });
