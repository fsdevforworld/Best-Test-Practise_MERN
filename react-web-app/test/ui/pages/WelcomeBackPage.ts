import BasePage from './BasePage';

class WelcomeBackPage extends BasePage {
  public open() {
    return browser.url('/register/existing-user');
  }

  get appStoreIcon() {
    return $('*=App Store');
  }

  get playStoreIcon() {
    return browser.react$('icon', { name: 'android' });
  }

  public openAppStore() {
    this.appStoreIcon.click();
  }

  public openPlayStore() {
    this.playStoreIcon.click();
  }

  get copy() {
    return browser.react$('p');
  }

  get existingUserText() {
    return "Looks like you're already a Dave member. Download the app to unlock your Dave membership benefits.";
  }
}

export default new WelcomeBackPage();
