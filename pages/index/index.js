const app = getApp();
const supabase = require('../../utils/supabase.js');
const {income, expense, functional} = app.globalData.iconCategories;
Page({
  data: {
    totalBalance: '0.00',
    monthIncome: '0.00',
    monthExpense: '0.00',
    recentBills: []
  },

  onLoad(options) {
    wx.showLoading({
      title: '加载中',
    })
    this.loadWithOpenid();
  },
  onShareAppMessage(res) {
    return {
      title: '记账本', // 转发卡片标题
      path: '/pages/index/index', // 转发后打开的页面路径
    };
  },
// 等待 openid 就绪
async loadWithOpenid() {
  try {
    // 等待 openid 就绪
    const openid = await app.ensureOpenid();
    
    this.setData({ 
      userOpenid: openid,
      loading: false
    }, () => {
      // 加载账本数据
      this.loadAccountData();
    });
  } catch (error) {
    wx.showToast({
      title: '登录失败，请重试',
      icon: 'none'
    });
    this.setData({ loading: false });
  }
},
  // 从 Supabase 加载账本数据（适配实际表结构）
  async loadAccountData() {
    if (!this.data.userOpenid) {
      wx.showToast({
        title: '请先登录',
        icon: 'none'
      });
      return;
    }
    wx.hideLoading();
    wx.showLoading({
      title: '加载中',
    })
    this.setData({ loading: true });

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
      if (statusCode != 200) throw errMsg;

      // 过滤本月账单并计算统计
      const monthBills = allBills.filter(bill => {
        // 兼容不同的日期格式
        return bill.date && bill.date.startsWith(currentMonthStr);
      });

      // 计算本月收入和支出
      let monthIncome = 0;
      let monthExpense = 0;

      monthBills.forEach(bill => {
        // 使用 amount 或 hisprice 字段作为金额（根据实际存储位置）
        const amount = parseFloat(bill.amount || bill.hisprice || '0') || 0;
        
        // 根据 type 字段判断收支类型
        if (bill.type === 'in' || bill.type === 'income' || bill.type === '收入') {
          monthIncome += amount;
        } else {
          monthExpense += amount;
        }
      });

      // 计算余额
      const totalBalance = monthIncome - monthExpense;
      
      // 处理最近账单数据（取前5条）
      const recentBills = (allBills || []).slice(0, 5).map(bill => {

        let billItem = {
          id: bill.id, // 使用实际的 ID 字段
          type: bill.type || 'expense',
          category: bill.text || '其他', // 使用 text 作为分类
          categoryIcon: bill.icon, // 使用 icon 字段
          amount: (parseFloat(bill.amount || bill.hisprice || '0') || 0).toFixed(2),
          note: bill.remarks || bill.text || '', // 使用 remarks 作为备注
          date: bill.date || '',
          paytype: bill.paytype || '', // 支付方式
          payment: bill.payment || '' // 支付账户
        }
        const incomeIcon = income.filter(i => i.icon == bill.icon);
        const expenseIcon = expense.filter(i => i.icon == bill.icon);
        if(incomeIcon.length <= 0 && expenseIcon <= 0) {
          billItem.categoryIcon = 'qita-60';
        }
        return billItem;
      });

      // 更新页面数据
      this.setData({
        totalBalance: totalBalance.toFixed(2),
        monthIncome: monthIncome.toFixed(2),
        monthExpense: monthExpense.toFixed(2),
        recentBills: recentBills,
        loading: false
      });
      
      wx.hideLoading();
    } catch (error) {
      wx.hideLoading();
      wx.showToast({
        title: '加载数据失败',
        icon: 'none'
      });
      this.setData({ loading: false });
    }
  },


  // 跳转到记收入页面
  goToIncome() {
    wx.navigateTo({
      url: '/pages/record/record?type=income'
    });
  },

  // 跳转到记支出页面
  goToExpense() {
    wx.navigateTo({
      url: '/pages/record/record?type=expense'
    });
  },

  // 跳转到账单列表页面
  goToBillList() {
    wx.navigateTo({
      url: '/pages/list/list'
    });
  },

  // 查看账单详情
  viewBillDetail(e) {
    const billId = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/detail/detail?id=${billId}`
    });
  }
})