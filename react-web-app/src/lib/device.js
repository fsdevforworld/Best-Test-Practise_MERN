import uuidv4 from 'uuid/v4';

export const getDeviceId = () => {
  let uuid = localStorage.getItem('Dave_Device_ID');
  if (!uuid) {
    uuid = uuidv4();
    localStorage.setItem('Dave_Device_ID', uuid);
  }
  return uuid;
};

export const getDeviceType = () => {
  return 'web';
};
