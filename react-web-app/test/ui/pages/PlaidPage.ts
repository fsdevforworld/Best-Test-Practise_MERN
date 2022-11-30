import BasePage from './BasePage';

class PlaidPage extends BasePage {
  public switchToPlaid() {
    return browser.switchToFrame(0);
  }

  public switchToDave() {
    return browser.switchToParentFrame();
  }

  get institutionButton() {
    return $('.InstitutionSelectPaneButton');
  }

  get daveUsesPlaidButton() {
    return $('#aut-continue-button');
  }

  get usernameInputField() {
    return $$('.Input__field')[0];
  }

  get passwordInputField() {
    return $$('.Input__field')[1];
  }

  get submitButton() {
    return $('.Button');
  }

  get plaidSearchInput() {
    return $('.InstitutionSearchInput__input');
  }

  get plaidSearchResult() {
    return $('.InstitutionSearchBrandResult__name');
  }

  public typePlaidUsernameAndPassword(username: string, password: string) {
    this.usernameInputField.setValue(username);
    this.passwordInputField.setValue(password);
    this.submitButton.click();
    // TODO: Remove this stupid pause if we get out of MVP
    browser.pause(1000);
    this.submitButton.waitForExist();
    this.submitButton.click();
  }

  public connectBank(username: string, password: string) {
    this.switchToPlaid();
    this.daveUsesPlaidButton.waitForExist();
    this.daveUsesPlaidButton.click();
    this.institutionButton.waitForExist();
    this.institutionButton.click();
    this.typePlaidUsernameAndPassword(username, password);
    this.switchToDave();
  }

  public connectLongTailBank() {
    this.switchToPlaid();
    this.plaidSearchInput.setValue('lena');
    this.plaidSearchResult.click();
    this.typePlaidUsernameAndPassword('user_good', 'pass_good');
    this.switchToDave();
  }
}

export default new PlaidPage();
