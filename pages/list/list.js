const app = getApp();
const supabase = require('../../utils/supabase.js');
const {income, expense, functional} = app.globalData.iconCategories;
Page({
  data: {
    selectedMonth: '',
    currentMonth: '',
    filterType: 'all',
    allBills: [],
    groupedBills: [],
    monthSummary: {
      income: '0.00',
      expense: '0.00',
      balance: '0.00'
    },
    hasBills: false
  },

  onLoad(options) {
    // 设置当前月份
    const now = new Date();
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const currentMonth = `${year}-${month}`;
    
    this.setData({
      userOpenid: app.globalData.openid || wx.getStorageSync('userInfo')?.openid,
      selectedMonth: currentMonth,
      currentMonth
    }, () => {
      // 加载账单数据
      this.loadBills();
    });
  },

  onShow() {
    // 返回页面时刷新数据
    this.loadBills();
  },
  calculateSummary(bills) {
    let income = 0;
    let expense = 0;
    
    bills.forEach(bill => {
      // 使用实际的金额字段
      const amount = parseFloat(bill.amount || bill.hisprice || '0') || 0;
      
      // 根据 type 字段判断收支类型
      if (bill.type === 'income' || bill.type === '收入') {
        income += amount;
      } else {
        expense += amount;
      }
    });
    
    const balance = income - expense;
    
    return {
      income: income.toFixed(2),
      expense: expense.toFixed(2),
      balance: balance.toFixed(2)
    };
  },
  // 加载账单数据
  async loadBills() {
    
    wx.hideLoading();
    wx.showLoading({
      title: '加载中',
    })
    // 模拟从API或本地缓存加载数据
    const mockBills = await this.getMockBills();
    
    // 筛选当前月份的账单
    const filteredBills = mockBills.filter(bill => {
      const billMonth = bill.date.substring(0, 7);
      return billMonth === this.data.selectedMonth;
    });
    
    // 根据类型进一步筛选
    const typeFilteredBills = this.data.filterType === 'all' 
      ? filteredBills 
      : filteredBills.filter(bill => bill.type === this.data.filterType);
    
    // 按日期分组
    const groupedBills = this.groupBillsByDate(typeFilteredBills);
    
    
    // 计算月度统计
    const summary = this.calculateSummary(typeFilteredBills);
    
    this.setData({
      allBills: mockBills,
      groupedBills,
      monthSummary: summary,
      hasBills: typeFilteredBills.length > 0
    });
    
    wx.hideLoading()
  },
  
  // 模拟账单数据
  async getMockBills() {
    try {
      // 获取当前年月
      const now = new Date();
      const currentYear = now.getFullYear().toString();
      const currentMonth = (now.getMonth() + 1).toString().padStart(2, '0');
      const currentMonthStr = `${currentYear}-${currentMonth}`;
      // 获取当前用户的所有账单
      const {data: allBills, statusCode, errMsg} = await supabase.query('wxapp', {
        select: '*',
        filters: [
          { column: '_openid', operator: 'eq', value: this.data.userOpenid },
          { column: 'trash', operator: 'eq', value: 0 },
        ],
        order: 'date', // 按日期排序
        desc: true
      });
      
      return allBills;
      if (statusCode != 200) throw errMsg;
    } catch (error) {
      wx.showToast({
        title: '加载数据失败',
        icon: 'none'
      });
    }
  },

  // 修改分组方法
groupBillsByDate(bills) {
  const groups = {};
  
  // 先按日期排序（新的在前）
  bills.sort((a, b) => new Date(b.date || '') - new Date(a.date || ''));
  
  // 分组
  bills.forEach(bill => {
    const billDate = bill.date || '未知日期';
    if (!groups[billDate]) {
      groups[billDate] = {
        bills: []
      };
    }
    groups[billDate].bills.push({
      id: bill.id,
      type: bill.type || 'expense',
      category: bill.text || '其他',
      categoryIcon: bill.icon,
      amount: (parseFloat(bill.amount || bill.hisprice || '0') || 0).toFixed(2),
      note: bill.remarks || bill.text || '',
      date: bill.date || '',
      paytype: bill.paytype || '',
      payment: bill.payment || ''
    });
  });
  return groups;
},

  // 计算月度统计
  calculateSummary(bills) {
    let income = 0;
    let expense = 0;
    
    bills.forEach(bill => {
      const amount = parseFloat(bill.amount);
      if (bill.type === 'income') {
        income += amount;
      } else {
        expense += amount;
      }
    });
    
    const balance = income - expense;
    
    return {
      income: income.toFixed(2),
      expense: expense.toFixed(2),
      balance: balance.toFixed(2)
    };
  },

  // 格式化日期分组标题
  formatDateGroup(dateStr) {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    const billDate = new Date(dateStr+ ' 00:00:00');
    if (billDate.toDateString() === today.toDateString()) {
      return '今天';
    } else if (billDate.toDateString() === yesterday.toDateString()) {
      return '昨天';
    } else {
      // 显示月/日
      return `${billDate.getMonth() + 1}月${billDate.getDate()}日`;
    }
  },

  // 月份选择器变化
  onMonthChange(e) {
    this.setData({
      selectedMonth: e.detail.value
    }, () => {
      this.loadBills();
    });
  },

  // 筛选类型选择
  selectFilter(e) {
    const type = e.currentTarget.dataset.type;
    this.setData({
      filterType: type
    }, () => {
      this.loadBills();
    });
  },

  // 查看账单详情
  viewBillDetail(e) {
    const billId = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/bill-detail/bill-detail?id=${billId}`
    });
  },

  // 跳转到添加账单页面
  goToAddBill() {
    wx.navigateTo({
      url: '/pages/record/record'
    });
  }
})