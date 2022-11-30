export default class BasePage {
  public devSixDigitCode = '111111';

  get daveLogo() {
    return browser.react$('SvgDave');
  }

  get textInput() {
    return browser.react$('t');
  }

  public button(buttontitle: string) {
    return browser.react$('button', { title: buttontitle });
  }

  get checkInCircleIcon() {
    return browser.react$('icon', { name: 'checkInCircle' });
  }
}
