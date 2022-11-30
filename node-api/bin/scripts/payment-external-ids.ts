import { QueryTypes } from 'sequelize';
import { sequelize } from '../../src/models';
import logger from '../../src/lib/logger';

// Tuples of reference ID to external ID
// https://demoforthedaves.atlassian.net/browse/USB-689
const referenceIds: Array<[string, string]> = [
  ['4764f59cdda20ca', 'iS82nMjUEWNVte-agp6yDw'],
  ['09d502385f72727', 'TesWn4rEESUy4cavhBrZIA'],
  ['1f412461a7073ff', 'iacFvzPUEUnflqIRPMG_Qg'],
  ['da96ffca9a99c77', 'BeMlnUPEEaOCFiB6xoO1zw'],
  ['39fd8e6576de36b', 'BesUjfDEkW2ei8FsqKMRsQ'],
  ['7edc592b4dc3b35', 'DesHrsLEEeGEVDs7e1o1OQ'],
  ['d8120a4b2dc6ede', 'gaM2nzTUmWNBZ9q0jBO6vg'],
  ['f2d42a829553d25', 'gaM2nzTUmWNBZ9q0jBO6vg'],
  ['4d8233e1e7581e5', 'yec2rGXEEUkYPXpAtwQJ6A'],
  ['b02a4adb68cfcee', 'zacGr5TVkeuwO8ptp1F9uw'],
  ['394981125ff4813', 'CWcljd_VGMtm-4394h4wFA'],
  ['3f381b749c22c4c', 'iSckvmjVGOtFADGHVuUeXw'],
  ['3015fcfab7bdcfa', 'Se8WrdjEEYs48y53luWFiw'],
  ['e9cfc42ce015f2d', 'iSM1rq7Uke_HFdRYPzpMtg'],
  ['278d2f884ca1241', 'SW8Ere3EESt05fc4ji3M1A'],
  ['d91210d59672c07', 'Ta80vl_VEa_j2EUppGZVew'],
  ['bae9982fa22b066', 'iaMHvY3VGQ_42IIOqdra8Q'],
  ['c2740074e5bb702', 'jesFv8TEmW96pBldxh7wdg'],
  ['47cb6135e0870d8', 'he8HnNnVmQtC-rtj2t2qdQ'],
  ['da1d17e93764f26', 'gaskn-bFkUOXzKmxqFH7-Q'],
  ['a38721fe4812a14', 'jec0v3PFESWlX14EjxMpew'],
  ['5b32711fb2a3b43', 'iS83nNXFGc0sLLCe5IwAqg'],
  ['21c1f269ff11018', 'CWsknuTVkKEzv447cG8-1w'],
  ['de1f97648e18841', 'gW8Wv7fUkSXqSFhK1W1rvg'],
  ['cdc8fbc64f43d16', 'gecln2_EkWW0XOBzt7QLqQ'],
  ['d7d2cebd802fa8a', 'TSMWvjzFke0qsw85qEEWXQ'],
  ['1dabd38c0b34de0', 'jWcHvMXFkcsnG3ZUB7tOCQ'],
  ['7a03006b08be467', 'wSMGju_VkQPDGTUO-Sw-Mw'],
  ['ee7351eb482852c', 'RSMWjVDVkav6I0lRDu6dvQ'],
  ['a17046f0414266a', 'ReMlnYrUGW9wu6NgVcN2Qw'],
  ['6d0c271c1f26ff1', 'je8Uv6TVmSFVZvWh3Q0J4A'],
  ['8b75715ddfcaeda', 'TWcUvJbEGeWMqqILKav0CA'],
  ['d2563fb22779705', 'iasXvvHVGKXNowBNxCKDRA'],
  ['1fe1c20d801aedf', 'xSMEja_UmW-wxfbucbLASg'],
  ['a36f03354413dfa', 'xWMWv7nVmeX7XVy5m1N4ug'],
  ['75f07cdd6a9c58e', 'gWs0v_kUIU8Q9zSNY4cw9A'],
  ['9a9642d7a1c650d', 'BeMmvE0FKSXkjzCHktPXJA'],
  ['3be2194b75d05ea', 'iesmv1gEoYMBpDppv9i9xA'],
  ['207f88ac30d8555', 'TaMXr20UKQvRcqTKLX82Ow'],
  ['ee48600abd6b50e', 'iacGvBkVKi_wCC9fsxIjpQ'],
  ['ef550020d9695f5', 'xe80nNYVocNw0OdWK9SjFw'],
  ['c0a4dc02cc1b59a', 'Aa8ErlMFqQnSapn8DHr3Kg'],
  ['cfe6d967210456c', 'wa8mvrMUqS1BGOeTyRZEzw'],
  ['3190d8a94ce15de', 'Aes0jHcUqaFsdNkx01EAiQ'],
  ['ff80a7da3426376', 'DacXjBAEqa8Nfo3b0YRe2w'],
  ['0c3e49dbbe595cf', 'TesGjSQFIY0UwHsppEy_qA'],
  ['61df573374ee84b', 'jecXrNQFoSPLIhM30eVeYQ'],
  ['c9ca1971f0da545', 'jScGv7IFKQESwrPVTaN4EA'],
  ['41652f0d4982517', 'xaMXrWYUIUUkfTbM-_E-eg'],
  ['0a5b4e1703d4551', 'iaMkvTgFomfwi8HNgxaf-Q'],
  ['3a3197461f0c560', 'jS82nrMUIYGe3lLYBxPhMg'],
  ['481fac5f8424523', 'CaMmvboEoc-iIMqOXex_uQ'],
  ['901dba8ed7195b9', 'iWcmnsMFIaPo1o54T4XAlw'],
  ['a873e02140c051a', 'ya8XjZYVKklFlg0jAGKVrw'],
  ['69b3f935397d5a7', 'TeM1rHIEoS8W4t_CacaTzg'],
  ['8c0903dc0141aa9', 'zaM0rVMVIQ_H-QQ3ZJfffw'],
  ['8b218280ac865e0', 'AW8lnrwFomWs_v9XosW_9g'],
  ['051a207b88565f7', 'CasnvhwEoeOnIznuzPxrCg'],
  ['780b5acd89ffc5f', 'QSsEjXYEKYelIN0zuMhTSA'],
  ['b047d7e45aa058e', 'xac2nfcEKQ25GNlZASAc9A'],
  ['fde170a6a7b1f16', 'Be8nrd0EqSNEXAK6Ka-K4A'],
  ['51d4ee00b2eb573', 'CSskv6EVIeVf5dkJ3XmkYw'],
  ['3ced9bef1ab1568', 'ySsVjfcFoaHVm3B5X-zfLg'],
  ['7512ef1358c2566', 'asVv94UqQ0tCi10mveCww'],
  ['0280a329489c21a', 'Cec2rWwVqUGTpaN6bXUBHw'],
  ['4299a635cfcf5fe', 'jWsnrQMEqm90SsqPJ6vyQA'],
  ['63436bb1b98b5ab', 'DSs1v-8FqedYihVSF6aHeA'],
  ['88e49f8eb28e576', 'CWMEjwoUIafabFSt1jKkXA'],
  ['9817b5091ba459e', 'AeskrKkEqe33pWRexy6L4w'],
  ['d5472332f74ab06', 'e81j2MEKa32woW0q1ISZQ'],
  ['27eac725dcc158a', 'hacln4oUKmnwOamBnhKBxA'],
  ['065ff91523c553f', 'Qec1njcVqiPCfqYmgADmNQ'],
  ['061439d7fb1ce1a', 'gW8Wr9UEoW8eeVO7UexUww'],
  ['0061efb4a123561', 'CSMFrBIUIWv2p-9KHNOv4Q'],
  ['cec4b34161a08d8', 'DWclvHMFIKueT5WhM94Jjg'],
  ['612edeca670f59f', 'DackvEkEIUeOZkQ-6cRwVQ'],
  ['efae9751fd6692a', 'yWslnzsUIQk3NOOO0VSIoQ'],
  ['e3c47911ab805e9', 'QecWvp8UKWOt30l5p-7u8A'],
  ['d7e96b6c69d75d6', 'zSM2nQgFoUlAktxR-Pk47w'],
  ['35a80848daf4568', 'xWs3vAQEqSk85A_o7UPnVg'],
  ['1c1ea82fdbe25d4', 'gWcljpQVocVKibbZuqe2Dg'],
  ['03874d6d085c522', 'Ta8ljEcUKWWWV0ZcI7FysA'],
  ['b71e1e3ae1a051a', 'xas0rtwEoKXCFHFwxTYK9Q'],
  ['8336e9ec721c577', 'jS8ljNtUKIH_lrvr1VPG9w'],
  ['4293a0ae60025b3', 'geM0nsdFKI3R4nMuqsCc0A'],
  ['bbb5b09627c9515', 'ReMHrjVUIeOc6JI9JIGsSA'],
  ['bf3d824f0a6f5b5', 'Qe8Uj_FEoM0DR8wGwaf4lg'],
  ['f1a30d1c1166595', 'zWMHnwkUOi_Q7fJjwvG_9Q'],
  ['5ecf4a5c11f55e4', 'hSsFjb0EOmVdZjbqVlaPFw'],
  ['d99a1762b8fc587', 'SWckrSAFOkN54Mao7W4BIQ'],
  ['23dfccd78cec569', 'SSc3nVwFscE3BygKkSFGsA'],
  ['e7b6edaeb9e418f', 'zaMHvSoFOKeqE7Eorj0Wcg'],
  ['504e56dd7740504', 'CeM0j4oUMImC1IoD88Py4Q'],
  ['f55214341559f66', 'QSsUjwxEQY3_VqPL__P1mg'],
  ['212112380e589c1', 'gSs2jQ9Uymty4PLGKfn15Q'],
  ['07f6eec445b53e1', 'gesWr4BUQkNr-L0MaCnWrg'],
  ['9d1204358232c65', 'Qec3nuZVQUNDtDbg4FiR_g'],
  ['e01878b98f99391', 'zWc2rCtEQkm-6meJoY5LnA'],
  ['f9f923532aeba84', 'zec1rJBEyg80ETw5aZFDKw'],
  ['7359779de8f539d', 'SaMEjU1ESc_p_NdhnV6vTA'],
  ['b06d1e6e8d71589', 'SacFjnPEWYVBExi0LbW7_A'],
  ['f9dad3601d4e573', 'yWsUn0rUWe-zU-dHnZvWog'],
  ['b711ba949d06536', 'AXwHkJ4VWeU4Wrw4mv4whA'],
  ['9f7e14c15e1498e', 'QfwVsGME2c09SiKfBnAsew'],
  ['d5db2a492681549', 'BbA2onwU2c08ANLpX2BrTQ'],
  ['2e2133d694295cd', 'yXglsFLEWaMmAArfq-OSBA'],
  ['bf0867cfe47a4aa', 'AfEloy3UEQXkIeZbmXsnkQ'],
  ['65f08752c76ce51', 'jX0FkdyE2MkJ-SGDyP5Qtw'],
];

async function main() {
  const query = `
    UPDATE payment
    SET external_id = :externalId
    WHERE reference_id = :referenceId
  `;

  const promiseQueries = referenceIds.map(async ([referenceId, externalId]) => {
    try {
      logger.info('Updating payment', { referenceId, externalId });
      await sequelize.query(query, {
        replacements: { referenceId, externalId },
        type: QueryTypes.UPDATE,
      });
    } catch (error) {
      logger.error('Error updating', { error, referenceId, externalId });
    }
  });

  await Promise.all(promiseQueries);
}

main()
  .then(() => process.exit())
  .catch(error => {
    logger.error('Update payment external ID job error', { error });
    process.exit(1);
  });
