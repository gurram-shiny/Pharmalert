/** Local logout remains available while server-side session revocation is offline. */
export async function signOutOnDevice(revoke:()=>Promise<unknown>, clear:()=>Promise<void>|void) {
  const attempt=Promise.resolve().then(revoke).catch(()=>undefined);
  await clear();
  await attempt;
}
