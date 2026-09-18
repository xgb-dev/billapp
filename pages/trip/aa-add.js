const { getTripById, updateTrip } = require('../../utils/tripData.js');

Page({
  data: {
    tripId: '',
    trip: null,
    title: '',
    amount: '',
    payer: '我',
    participants: [],
    date: '',
    remarks: '',
    perPersonAmount: '0.00'
  },

  onLoad(options) {
    const tripId = options.tripId;
    if (!tripId) {
      wx.showToast({ title: '参数错误', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1000);
      return;
    }

    const trip = getTripById(tripId);
    if (!trip) {
      wx.showToast({ title: '活动不存在', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1000);
      return;
    }

    const today = new Date();
    const y = today.getFullYear();
    const m = (today.getMonth() + 1).toString().padStart(2, '0');
    const d = today.getDate().toString().padStart(2, '0');

    // 默认全员参与平摊
    const defaultParticipants = [...trip.members];

    this.setData({
      tripId,
      trip,
      date: `${y}-${m}-${d}`,
      payer: trip.members[0] || '我',
      participants: defaultParticipants
    });
  },

  onTitleInput(e) {
    this.setData({ title: e.detail.value });
  },

  onAmountInput(e) {
    let val = e.detail.value;
    if (val.includes('.')) {
      const parts = val.split('.');
      if (parts[1].length > 2) val = parts[0] + '.' + parts[1].slice(0, 2);
    }
    this.setData({ amount: val }, () => {
      this.recalcPerPerson();
    });
  },

  onDateChange(e) {
    this.setData({ date: e.detail.value });
  },

  onRemarksInput(e) {
    this.setData({ remarks: e.detail.value });
  },

  // 选择付款人
  selectPayer(e) {
    this.setData({ payer: e.currentTarget.dataset.name });
  },

  // 切换分摊人勾选状态
  toggleParticipant(e) {
    const name = e.currentTarget.dataset.name;
    let parts = [...this.data.participants];
    if (parts.includes(name)) {
      // 至少保留一人分摊
      if (parts.length <= 1) {
        wx.showToast({ title: '至少需要一人分摊', icon: 'none' });
        return;
      }
      parts = parts.filter(n => n !== name);
    } else {
      parts.push(name);
    }
    this.setData({ participants: parts }, () => {
      this.recalcPerPerson();
    });
  },

  // 全选分摊人
  selectAllParticipants() {
    this.setData({
      participants: [...this.data.trip.members]
    }, () => {
      this.recalcPerPerson();
    });
  },

  // 计算每人平摊金额
  recalcPerPerson() {
    const amt = parseFloat(this.data.amount) || 0;
    const count = this.data.participants.length || 1;
    this.setData({
      perPersonAmount: (amt / count).toFixed(2)
    });
  },

  // 提交保存这笔集体 AA
  submitExpense() {
    const { title, amount, payer, participants, date, remarks, trip } = this.data;
    if (!title.trim()) {
      wx.showToast({ title: '请填写消费项目', icon: 'none' });
      return;
    }
    const amtNum = parseFloat(amount);
    if (!amtNum || amtNum <= 0) {
      wx.showToast({ title: '请输入有效金额', icon: 'none' });
      return;
    }
    if (!participants || participants.length === 0) {
      wx.showToast({ title: '请选择分摊人员', icon: 'none' });
      return;
    }

    const newExpense = {
      id: 'exp_' + Date.now(),
      title: title.trim(),
      amount: amtNum.toFixed(2),
      payer,
      participants,
      date,
      remarks: remarks.trim()
    };

    const updatedTrip = { ...trip };
    updatedTrip.expenses = updatedTrip.expenses || [];
    updatedTrip.expenses.unshift(newExpense);

    updateTrip(updatedTrip);

    wx.showToast({ title: '记录成功', icon: 'success' });
    setTimeout(() => {
      wx.navigateBack();
    }, 1000);
  }
});

