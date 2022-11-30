import { AxiosResponse } from 'axios';

/**
 * GOALS API responds with a 403 if there is no goal account for the user for which we are making a request.
 * This does not apply to the getAccount call, whose response is a 201 for a non-existent user.
 *
 * GOALS API responds with 404 when trying to access data that does not belong to the client's associated user,
 * or when there is no data by that ID.
 */
async function performRequest<T>(request: Promise<AxiosResponse<T>>): Promise<T> {
  try {
    const { data } = await request;
    return data;
  } catch (err) {
    if ([403, 404].includes(err?.response?.status)) {
      return null;
    } else {
      throw err;
    }
  }
}

export default performRequest;
