import { MongoClient, type Db } from 'mongodb';

export async function getMongoDb(
  uri: string,
): Promise<Db> {
  console.log('[MongoDB] Creating new client');

  const client = new MongoClient(uri);

  await client.connect();

  console.log('[MongoDB] Connected');

  return client.db('nexchat');
}
