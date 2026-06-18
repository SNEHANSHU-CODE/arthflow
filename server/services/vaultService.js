const Vault = require('../models/vaultModel');
const { encryptPassword } = require('../utils/cryptoUtils');

class VaultService {
  async uploadDocument(userId, { name, originalName, mimeType, size, data, tags, description }) {
    const doc = new Vault({ userId, name, originalName, mimeType, size, data, tags, description });
    await doc.save();
    return { success: true, data: this._sanitize(doc) };
  }

  async getUserDocuments(userId) {
    const docs = await Vault.find({ userId }).select('-data').sort({ createdAt: -1 });
    return { success: true, data: docs };
  }

  async getDocumentById(docId, userId) {
    const doc = await Vault.findOne({ _id: docId, userId });
    if (!doc) throw new Error('Document not found');
    return { success: true, data: doc };
  }

  async deleteDocument(docId, userId) {
    const doc = await Vault.findOneAndDelete({ _id: docId, userId });
    if (!doc) throw new Error('Document not found');
    return { success: true, message: 'Document deleted' };
  }

  async updateDocument(docId, userId, updates) {
    const allowed = { name: updates.name, tags: updates.tags, description: updates.description };
    const doc = await Vault.findOneAndUpdate({ _id: docId, userId }, allowed, { new: true }).select('-data');
    if (!doc) throw new Error('Document not found');
    return { success: true, data: doc };
  }

  async saveDocumentPassword(documentId, userId, password) {
    const doc = await Vault.findOne({ _id: documentId, userId });
    if (!doc) throw new Error('Document not found');

    doc.pdfPassword = encryptPassword(password);
    doc.passwordProtected = true;
    // Reset so cron picks it up again now that we have the password
    doc.isProcessedForRAG = false;
    await doc.save();

    return { success: true, message: 'Password saved — document will be processed shortly' };
  }

  _sanitize(doc) {
    const obj = doc.toObject();
    delete obj.data;
    return obj;
  }
}

module.exports = new VaultService();