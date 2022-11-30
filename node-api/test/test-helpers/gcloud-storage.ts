export default function mockGCloudStorageUrl(directory: string, userId: number, uuid: string) {
  return `https://storage.cloud.google.com/dave-staging-173321/images-staging/${directory}/${userId}-${uuid}-original.image/png`;
}
