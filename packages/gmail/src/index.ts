export interface GmailClient {
  watchMailbox(accountId: string): Promise<void>;
}

export const createStubGmailClient = (): GmailClient => {
  return {
    watchMailbox: async () => undefined,
  };
};
