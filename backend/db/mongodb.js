// ============================================================
//  MONGODB CONNEXION
// ============================================================

const { MongoClient } = require('mongodb');

let client = null;
let db = null;

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.DB_NAME || 'gagne';

async function connectDB() {
  if (db) return db;

  try {
    if (!MONGODB_URI) {
      throw new Error('MONGODB_URI non définie dans les variables d\'environnement');
    }

    console.log('🔄 Connexion à MongoDB...');
    client = new MongoClient(MONGODB_URI, {
      maxPoolSize: 10,
      minPoolSize: 2,
    });

    await client.connect();
    db = client.db(DB_NAME);
    console.log('✅ Connecté à MongoDB Atlas');

    // Créer les index
    await createIndexes(db);
    
    return db;
  } catch (error) {
    console.error('❌ Erreur de connexion MongoDB:', error);
    throw error;
  }
}

async function createIndexes(db) {
  try {
    // Vérifier que les collections existent
    const collections = ['ebooks', 'orders', 'transactions'];
    
    for (const name of collections) {
      const list = await db.listCollections({ name }).toArray();
      if (list.length === 0) {
        await db.createCollection(name);
        console.log(`📁 Collection "${name}" créée`);
      }
    }

    // Index sur ebooks
    const ebooksCollection = db.collection('ebooks');
    await ebooksCollection.createIndex({ title: 'text', category: 1 });
    await ebooksCollection.createIndex({ createdAt: -1 });

    // Index sur orders
    const ordersCollection = db.collection('orders');
    await ordersCollection.createIndex({ transaction_id: 1 }, { unique: true });
    await ordersCollection.createIndex({ date: -1 });

    console.log('✅ Index MongoDB créés');
  } catch (error) {
    console.error('❌ Erreur création index:', error);
  }
}

async function getCollection(name) {
  if (!db) {
    await connectDB();
  }
  return db.collection(name);
}

async function closeDB() {
  if (client) {
    await client.close();
    console.log('🔒 Connexion MongoDB fermée');
  }
}

module.exports = {
  connectDB,
  getCollection,
  closeDB,
  DB_NAME
};