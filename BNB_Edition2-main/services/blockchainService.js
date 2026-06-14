const crypto = require("crypto");

class BlockchainService {
  constructor() {
    this.chain = [];
    this.pendingTransactions = [];
    this.difficulty = 2;
    this.miningReward = 100;

    this.createGenesisBlock();
  }

  createGenesisBlock() {
    const genesisBlock = {
      index: 0,
      timestamp: Date.now(),
      transactions: [],
      previousHash: "0",
      nonce: 0,
      hash: this.calculateHash(0, Date.now(), [], "0", 0),
    };

    this.chain.push(genesisBlock);
  }

  calculateHash(index, timestamp, transactions, previousHash, nonce) {
    return crypto
      .createHash("sha256")
      .update(
        index + timestamp + JSON.stringify(transactions) + previousHash + nonce
      )
      .digest("hex");
  }

  getLatestBlock() {
    return this.chain[this.chain.length - 1];
  }

  createTransaction(transactionData) {
    const transaction = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      data: transactionData,
      signature: this.signTransaction(transactionData),
    };

    this.pendingTransactions.push(transaction);
    return transaction.id;
  }

  signTransaction(data) {
    return crypto
      .createHash("sha256")
      .update(JSON.stringify(data) + Date.now())
      .digest("hex")
      .substring(0, 16);
  }

  minePendingTransactions(miningRewardAddress) {
    const rewardTransaction = {
      from: null,
      to: miningRewardAddress,
      amount: this.miningReward,
      timestamp: Date.now(),
    };

    this.pendingTransactions.push(rewardTransaction);

    const block = {
      index: this.chain.length,
      timestamp: Date.now(),
      transactions: this.pendingTransactions,
      previousHash: this.getLatestBlock().hash,
      nonce: 0,
    };

    block.hash = this.mineBlock(block);
    this.chain.push(block);
    this.pendingTransactions = [];

    return block;
  }

  mineBlock(block) {
    let hash = this.calculateHash(
      block.index,
      block.timestamp,
      block.transactions,
      block.previousHash,
      block.nonce
    );

    const target = Array(this.difficulty + 1).join("0");

    while (hash.substring(0, this.difficulty) !== target) {
      block.nonce++;
      hash = this.calculateHash(
        block.index,
        block.timestamp,
        block.transactions,
        block.previousHash,
        block.nonce
      );
    }

    return hash;
  }

  getBalance(address) {
    let balance = 0;

    for (const block of this.chain) {
      for (const transaction of block.transactions) {
        if (transaction.to === address) {
          balance += transaction.amount;
        }
        if (transaction.from === address) {
          balance -= transaction.amount;
        }
      }
    }

    return balance;
  }

  isChainValid() {
    for (let i = 1; i < this.chain.length; i++) {
      const currentBlock = this.chain[i];
      const previousBlock = this.chain[i - 1];

      if (currentBlock.previousHash !== previousBlock.hash) {
        return false;
      }

      const calculatedHash = this.calculateHash(
        currentBlock.index,
        currentBlock.timestamp,
        currentBlock.transactions,
        currentBlock.previousHash,
        currentBlock.nonce
      );

      if (currentBlock.hash !== calculatedHash) {
        return false;
      }
    }

    return true;
  }

  async storeTransaction(transactionData) {
    try {
      const transactionId = this.createTransaction({
        type: "budget_transaction",
        budgetId: transactionData.budgetId,
        description: transactionData.description,
        amount: transactionData.amount,
        category: transactionData.category,
        status: transactionData.status,
        timestamp: transactionData.createdAt,
        receiptHash: transactionData.receipt
          ? crypto
              .createHash("sha256")
              .update(transactionData.receipt.url)
              .digest("hex")
          : null,
        transactionHash: transactionData.transactionHash,
      });

      const block = this.minePendingTransactions("system");

      return {
        success: true,
        transactionId,
        blockHash: block.hash,
        blockIndex: block.index,
        confirmationTime: new Date().toISOString(),
      };
    } catch (error) {
      console.error("Error storing transaction in blockchain:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  getTransaction(transactionId) {
    for (const block of this.chain) {
      for (const transaction of block.transactions) {
        if (transaction.id === transactionId) {
          return {
            ...transaction,
            blockHash: block.hash,
            blockIndex: block.index,
            confirmed: true,
          };
        }
      }
    }
    return null;
  }

  getStats() {
    return {
      totalBlocks: this.chain.length,
      totalTransactions: this.chain.reduce(
        (sum, block) => sum + block.transactions.length,
        0
      ),
      pendingTransactions: this.pendingTransactions.length,
      isChainValid: this.isChainValid(),
      lastBlockHash: this.getLatestBlock().hash,
      chainLength: this.chain.length,
    };
  }
}

module.exports = new BlockchainService();
