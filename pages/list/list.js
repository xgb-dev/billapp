const app = getApp();
const supabase = require('../../utils/supabase.js');
const {income, expense, functional} = app.globalData.iconCategories;

Page({
  data: {
    selectedMonth: '',
    currentMonth: '',
    filterType: 'all',
    searchKey: '',
    isSearching: false,
    showRanking: false,
    allBills: [],
    monthBills: [],
    groupedBills: {},
    categoryRankings: [],
    monthSummary: {
      income: '0.00',
      expense: '0.00',
      balance: '0.00'
    },
    hasBills: false
  },

  onLoad(options) {
    const now = new Date();
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const currentMonth = `${year}-${month}`;
    
    this.setData({
      userOpenid: app.globalData.openid || wx.getStorageSync('userInfo')?.openid,
      selectedMonth: currentMonth,
      currentMonth
    }, () => {
      this.loadBills();
    });
  },

  onShow() {
    this.loadBills();
  },

  // 加载账单数据
  async loadBills() {
    wx.hideLoading();
    wx.showLoading({
      title: '加载中',
    });

    const mockBills = await this.getMockBills() || [];

    // 筛选当前月份的全部账单
    const monthBills = mockBills.filter(bill => {
      const billMonth = (bill.date || '').substring(0, 7);
      return billMonth === this.data.selectedMonth;
    });

    // 计算当月分类支出排行榜
    const categoryRankings = this.calculateCategoryRanking(monthBills);

    this.setData({
      allBills: mockBills,
      monthBills,
      categoryRankings
    }, () => {
      this.filterAndRenderBills();
      wx.hideLoading();
    });
  },

  // 本地快速过滤与渲染账单
  filterAndRenderBills() {
    const { monthBills, filterType, searchKey } = this.data;
    
    // 1. 类型筛选
    let filtered = filterType === 'all'
      ? monthBills
      : monthBills.filter(bill => {
          const type = bill.type || 'expense';
          return filterType === 'income' ? (type === 'income' || type === 'in' || type === '收入') : (type !== 'income' && type !== 'in' && type !== '收入');
        });

    // 2. 关键字即时搜索
    const keyword = searchKey.trim().toLowerCase();
    const isSearching = keyword.length > 0;
    if (isSearching) {
      filtered = filtered.filter(bill => {
        const text = (bill.text || '').toLowerCase();
        const remarks = (bill.remarks || '').toLowerCase();
        const amount = String(bill.amount || bill.hisprice || '');
        return text.includes(keyword) || remarks.includes(keyword) || amount.includes(keyword);
      });
    }

    // 3. 按日期分组
    const groupedBills = this.groupBillsByDate(filtered);

    // 4. 计算当期汇总指标
    const summary = this.calculateSummary(filtered);

    this.setData({
      groupedBills,
      monthSummary: summary,
      hasBills: filtered.length > 0,
      isSearching
    });
  },

  // 计算分类支出占比排行榜
  calculateCategoryRanking(bills) {
    // 过滤出所有支出
    const expenseBills = bills.filter(b => {
      const t = b.type || 'expense';
      return t !== 'income' && t !== 'in' && t !== '收入';
    });

    if (expenseBills.length === 0) return [];

    let totalExpense = 0;
    const catMap = {};

    expenseBills.forEach(bill => {
      const amount = parseFloat(bill.amount || bill.hisprice || '0') || 0;
      const catName = bill.text || '其他';
      const icon = bill.icon || 'qita-60';
      totalExpense += amount;

      if (!catMap[catName]) {
        catMap[catName] = {
          name: catName,
          icon: icon,
          total: 0,
          count: 0
        };
      }
      catMap[catName].total += amount;
      catMap[catName].count += 1;
    });

    if (totalExpense <= 0) return [];

    // 排序并计算百分比
    const rankings = Object.values(catMap).map(item => {
      const percent = Math.min(Math.round((item.total / totalExpense) * 100), 100);
      return {
        name: item.name,
        icon: item.icon,
        total: item.total.toFixed(2),
        percent: percent,
        count: item.count
      };
    }).sort((a, b) => parseFloat(b.total) - parseFloat(a.total));

    return rankings;
  },

  // 模拟/远程查询账单数据
  async getMockBills() {
    try {
      const { data: allBills, statusCode, errMsg } = await supabase.query('wxapp', {
        select: '*',
        filters: [
          { column: '_openid', operator: 'eq', value: this.data.userOpenid },
          { column: 'trash', operator: 'eq', value: 0 },
        ],
        order: 'date',
        desc: true
      });
      return allBills || [];
    } catch (error) {
      wx.showToast({
        title: '加载数据失败',
        icon: 'none'
      });
      return [];
    }
  },

  // 修改分组方法
  groupBillsByDate(bills) {
    const groups = {};
    bills.sort((a, b) => new Date(b.date || '') - new Date(a.date || ''));

    bills.forEach(bill => {
      const billDate = bill.date || '未知日期';
      if (!groups[billDate]) {
        groups[billDate] = {
          friendlyDate: this.formatDateGroup(billDate),
          bills: []
        };
      }

      let type = bill.type || 'expense';
      if (type === 'in' || type === '收入') type = 'income';
      if (type === 'out' || type === '支出') type = 'expense';

      groups[billDate].bills.push({
        id: bill.id,
        type: type,
        category: bill.text || '其他',
        categoryIcon: bill.icon,
        amount: (parseFloat(bill.amount || bill.hisprice || '0') || 0).toFixed(2),
        note: bill.remarks || '',
        date: bill.date || '',
        paytype: bill.paytype || '',
        payment: bill.payment || ''
      });
    });
    return groups;
  },

  // 计算月度/搜索汇总
  calculateSummary(bills) {
    let income = 0;
    let expense = 0;

    bills.forEach(bill => {
      const amount = parseFloat(bill.amount || bill.hisprice || '0') || 0;
      const type = bill.type || 'expense';
      if (type === 'income' || type === 'in' || type === '收入') {
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

    const billDate = new Date(dateStr + ' 00:00:00');
    if (billDate.toDateString() === today.toDateString()) {
      return '今天';
    } else if (billDate.toDateString() === yesterday.toDateString()) {
      return '昨天';
    } else {
      return `${billDate.getMonth() + 1}月${billDate.getDate()}日`;
    }
  },

  // 即时搜索输入
  onSearchInput(e) {
    const val = e.detail.value;
    this.setData({
      searchKey: val
    }, () => {
      this.filterAndRenderBills();
    });
  },

  // 清除搜索
  clearSearch() {
    this.setData({
      searchKey: ''
    }, () => {
      this.filterAndRenderBills();
    });
  },

  // 展开/收起支出排行榜
  toggleRanking() {
    this.setData({
      showRanking: !this.data.showRanking
    });
  },

  // 月份选择器变化
  onMonthChange(e) {
    this.setData({
      selectedMonth: e.detail.value,
      searchKey: '' // 切换月份时重置搜索
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
      this.filterAndRenderBills();
    });
  },

  // 查看账单详情
  viewBillDetail(e) {
    const billId = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/detail/detail?id=${billId}`
    });
  },

  // 跳转到添加账单页面
  goToAddBill() {
    wx.navigateTo({
      url: '/pages/record/record'
    });
  },

  // 跳转到统计图表页面
  goToChart() {
    wx.navigateTo({
      url: '/pages/chart/chart'
    });
  }
});