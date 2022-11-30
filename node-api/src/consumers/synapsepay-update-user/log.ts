export default function log(
  logger: (msg: string, data: any) => void,
  msg: string,
  synapsePayUserId: string,
  extra?: any,
): void {
  const logInfo = {
    synapsePayUserId,
    ...extra,
  };
  logger(msg, logInfo);
}
