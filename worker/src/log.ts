export function emit(
  event: string,
  fields: Record<string, string | number | boolean | null>,
): void {
  console.log(JSON.stringify({ event, ...fields }));
}
