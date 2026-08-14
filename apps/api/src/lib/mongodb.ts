import { MongoClient } from 'mongodb';

const uri = process.env.MONGO_URI;

if (!uri) {
  throw new Error('MONGO_URI is not defined');
}

const client = new MongoClient(uri);

let connected = false;

export async function connectMongo(): Promise<void> {
  if (connected) {
    return;
  }

  await client.connect();

  await client.db('nexchat').command({
    ping: 1,
  });

  connected = true;

  console.log('MongoDB connected');
}

export function getMongoClient(): MongoClient {
  return client;
}
