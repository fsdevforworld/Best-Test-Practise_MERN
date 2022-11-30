export default function singularizeResource(resource: string): string {
  return resource.replace(/s$/, '');
}
