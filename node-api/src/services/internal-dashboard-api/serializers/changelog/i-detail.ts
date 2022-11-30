interface IDetail {
  type: string;
  attributes: {
    [key: string]: unknown;
  };
}

export default IDetail;
