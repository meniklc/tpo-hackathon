const Transaction = require("../models/Transaction");

const awardBadges = async (user) => {
  const badges = [];
  
  if (user.transactionsSubmitted === 1 && !user.badges.some(b => b.name === 'First Transaction')) {
    badges.push({
      name: 'First Transaction',
      description: 'Submitted your first transaction',
      icon: '🎯',
      earnedAt: new Date()
    });
  }
  
  if (user.receiptsUploaded >= 10 && !user.badges.some(b => b.name === 'Receipt Master')) {
    badges.push({
      name: 'Receipt Master',
      description: 'Uploaded 10+ receipts',
      icon: '📄',
      earnedAt: new Date()
    });
  }
  
  if (user.transactionsSubmitted >= 50 && !user.badges.some(b => b.name === 'Transaction Pro')) {
    badges.push({
      name: 'Transaction Pro',
      description: 'Submitted 50+ transactions',
      icon: '💼',
      earnedAt: new Date()
    });
  }
  
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const recentTransactions = await Transaction.countDocuments({
    createdBy: user._id,
    createdAt: { $gte: weekAgo }
  });
  
  if (recentTransactions >= 7 && !user.badges.some(b => b.name === 'Perfect Week')) {
    badges.push({
      name: 'Perfect Week',
      description: 'Submitted transactions every day for a week',
      icon: '⭐',
      earnedAt: new Date()
    });
  }
  
  if (badges.length > 0) {
    user.badges.push(...badges);
    user.points += badges.length * 10;
    
    const newLevel = Math.floor(user.points / 100) + 1;
    if (newLevel > user.level) {
      user.level = newLevel;
      badges.push({
        name: `Level ${newLevel}`,
        description: `Reached level ${newLevel}`,
        icon: '🏆',
        earnedAt: new Date()
      });
    }
    
    await user.save();
  }
  
  return badges;
};

module.exports = { awardBadges };
