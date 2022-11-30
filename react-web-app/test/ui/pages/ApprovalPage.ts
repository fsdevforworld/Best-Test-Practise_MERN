import BasePage from './BasePage';

class ApprovalPage extends BasePage {
  public open() {
    browser.url('/register/advance-qualify');
  }

  get howDoIGetApprovedLink() {
    return $('p=How do I get approved?');
  }

  get howDoIGetApprovedTitle() {
    return $('h1=How do I get approved?');
  }

  get weGotThisAccountCoveredTitle() {
    return $('h1=We got this account covered');
  }

  get downloadOurAppToProceedTitle() {
    return $('h1=Download our app to proceed');
  }

  get gotItButton() {
    return $('button=Got it!');
  }

  get connectYourBankButton() {
    return $('button=Connect your bank');
  }
}

export default new ApprovalPage();
