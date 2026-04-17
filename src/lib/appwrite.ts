import { Client, Account } from '@codeflicker/appwrite';

const client = new Client()
  .setEndpoint(import.meta.env.VITE_APPWRITE_ENDPOINT || 'https://frontend-cloud.corp.kuaishou.com/v1')
  .setProject(import.meta.env.VITE_APPWRITE_PROJECT_ID || 'image_tools');

export const account = new Account(client);
export { client };
