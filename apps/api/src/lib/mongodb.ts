import { MongoClient, type Db } from 'mongodb';

const mongoUri = process.env.MONGO_URI;

if (!mongoUri) {
  throw new Error('MONGO_URI is not defined');
}

const client = new MongoClient(mongoUri);

let db: Db | null = null;

export async function connectMongo(): Promise<Db> {
  await client.connect();

  db = client.db();

  console.log('Connected to MongoDB');

  return db;
}

export function getMongoDb(): Db {
  if (!db) {
    throw new Error('MongoDB is not connected');
  }

  return db;
}
