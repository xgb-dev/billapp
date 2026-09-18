const app = getApp();
const supabase = require('../../utils/supabase.js');

// 专属精致现代配色盘（用于环形图和各分类进度）
const CHART_COLORS = [
  '#F43F5E', // 珊瑚红
  '#3B82F6', // 科技蓝
  '#10B981', // 薄荷绿
  '#F59E0B', // 暖阳橙
  '#8B5CF6', // 梦幻紫
  '#EC4899', // 玫瑰粉
  '#06B6D4', // 青玉蓝
  '#84CC16', // 活力青柠
  '#64748B'  // 沉静灰
];

Page({
  data: {
    selectedMonth: '',
    currentMonth: '',
    totalExpense: '0.00',
    totalIncome: '0.00',
    totalBalance: '0.00',
    dailyAverage: '0.00',
    hasExpense: false,
    categoryList: [],
    // 智能消费洞察
    insights: {
      maxBill: null,
      topCountCat: null
    }
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
      this.loadChartData();
    });
  },

  onShow() {
    this.loadChartData();
  },

  // 加载统计数据
  async loadChartData() {
    wx.showLoading({ title: '统计中...' });

    try {
      const { data: allBills } = await supabase.query('wxapp', {
        select: '*',
        filters: [
          { column: '_openid', operator: 'eq', value: this.data.userOpenid },
          { column: 'trash', operator: 'eq', value: 0 },
        ],
        order: 'date',
        desc: true
      });

      const bills = (allBills || []).filter(bill => {
        const bMonth = (bill.date || '').substring(0, 7);
        return bMonth === this.data.selectedMonth;
      });

      this.processData(bills);
      wx.hideLoading();
    } catch (error) {
      wx.hideLoading();
      wx.showToast({ title: '数据加载失败', icon: 'none' });
    }
  },

  // 数据聚合与洞察计算
  processData(bills) {
    let totalIncome = 0;
    let totalExpense = 0;
    let maxExpense = 0;
    let maxBill = null;
    const catMap = {};

    bills.forEach(bill => {
      const amount = parseFloat(bill.amount || bill.hisprice || '0') || 0;
      let type = bill.type || 'expense';
      if (type === 'in' || type === '收入') type = 'income';
      if (type === 'out' || type === '支出') type = 'expense';

      if (type === 'income') {
        totalIncome += amount;
      } else {
        totalExpense += amount;
        // 查找最大单笔支出
        if (amount > maxExpense) {
          maxExpense = amount;
          maxBill = {
            category: bill.text || '其他',
            icon: bill.icon || 'qita-60',
            amount: amount.toFixed(2),
            date: bill.date || ''
          };
        }

        // 分类聚合
        const catName = bill.text || '其他';
        const icon = bill.icon || 'qita-60';
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
      }
    });

    // 计算日均支出
    const now = new Date();
    const [yStr, mStr] = this.data.selectedMonth.split('-');
    const curYear = now.getFullYear();
    const curMonth = now.getMonth() + 1;
    let daysPassed = 1;
    if (parseInt(yStr) === curYear && parseInt(mStr) === curMonth) {
      daysPassed = Math.max(now.getDate(), 1);
    } else {
      daysPassed = new Date(parseInt(yStr), parseInt(mStr), 0).getDate();
    }
    const dailyAverage = (totalExpense / daysPassed).toFixed(2);

    // 计算分类排行榜与分配颜色
    const sortedCats = Object.values(catMap).sort((a, b) => b.total - a.total);
    let topCountCat = null;
    let maxCount = 0;

    const categoryList = sortedCats.map((item, idx) => {
      if (item.count > maxCount) {
        maxCount = item.count;
        topCountCat = { name: item.name, count: item.count };
      }
      const pct = totalExpense > 0 ? Math.round((item.total / totalExpense) * 100) : 0;
      return {
        name: item.name,
        icon: item.icon,
        total: item.total.toFixed(2),
        count: item.count,
        percent: pct,
        color: CHART_COLORS[idx % CHART_COLORS.length]
      };
    });

    const balance = totalIncome - totalExpense;

    this.setData({
      totalExpense: totalExpense.toFixed(2),
      totalIncome: totalIncome.toFixed(2),
      totalBalance: balance.toFixed(2),
      dailyAverage,
      hasExpense: totalExpense > 0,
      categoryList,
      insights: {
        maxBill,
        topCountCat
      }
    }, () => {
      if (this.data.hasExpense) {
        this.drawDonutChart(categoryList);
      }
    });
  },

  // 绘制环形图 (Canvas)
  drawDonutChart(categories) {
    const ctx = wx.createCanvasContext('donutCanvas', this);
    const centerX = 130;
    const centerY = 130;
    const radius = 90;
    const lineWidth = 24;

    ctx.clearRect(0, 0, 260, 260);

    let startAngle = -0.5 * Math.PI;

    categories.forEach(item => {
      const sliceAngle = (item.percent / 100) * 2 * Math.PI;
      const endAngle = startAngle + sliceAngle;

      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, startAngle, endAngle, false);
      ctx.setLineWidth(lineWidth);
      ctx.setStrokeStyle(item.color);
      ctx.setLineCap('round');
      ctx.stroke();

      startAngle = endAngle;
    });

    ctx.draw();
  },

  // 月份切换
  onMonthChange(e) {
    this.setData({
      selectedMonth: e.detail.value
    }, () => {
      this.loadChartData();
    });
  }
});

