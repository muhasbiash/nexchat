import { MongoClient, type Db } from 'mongodb';

export async function withMongoDb<T>(uri: string, callback: (db: Db) => Promise<T>): Promise<T> {
  const client = new MongoClient(uri);

  console.log('[MongoDB] Creating request-scoped client');

  try {
    await client.connect();

    console.log('[MongoDB] Connected');

    const db = client.db('nexchat');

    return await callback(db);
  } finally {
    await client.close();

    console.log('[MongoDB] Client closed');
  }
}
