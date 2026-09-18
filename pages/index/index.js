const app = getApp();
const supabase = require('../../utils/supabase.js');
const { getTrips, syncTripsFromCloud, deleteTrip, joinTripByCode } = require('../../utils/tripData.js');
const {income, expense, functional} = app.globalData.iconCategories;
Page({
  data: {
    totalBalance: '0.00',
    monthIncome: '0.00',
    monthExpense: '0.00',
    recentBills: [],
    loading: false,
    isHideAmount: false,
    monthlyBudget: 0,
    hasBudget: false,
    budgetRemaining: '0.00',
    budgetPercent: 0,
    budgetStatus: 'normal',
    trips: [],
    showJoinModal: false,
    joinInputCode: '',
    joinMemberName: ''
  },

  onLoad(options) {
    const isHideAmount = wx.getStorageSync('isHideAmount') || false;
    const monthlyBudget = parseFloat(wx.getStorageSync('monthlyBudget')) || 0;
    this.setData({
      isHideAmount,
      monthlyBudget,
      hasBudget: monthlyBudget > 0
    });

    // 如果通过分享卡片或链接进入，带入口令并自动打开加入弹窗
    if (options && options.joinCode) {
      this.setData({
        showJoinModal: true,
        joinInputCode: options.joinCode.toUpperCase()
      });
    }

    wx.showLoading({
      title: '加载中',
    });
    this.loadWithOpenid();
  },
  onShow() {
    // 加载旅行小队活动数据
    this.loadTrips();

    // 每次显示页面更新预算缓存设置
    const monthlyBudget = parseFloat(wx.getStorageSync('monthlyBudget')) || 0;
    if (monthlyBudget !== this.data.monthlyBudget) {
      this.setData({
        monthlyBudget,
        hasBudget: monthlyBudget > 0
      });
      if (this.data.monthExpenseNum !== undefined) {
        this.calculateBudget(this.data.monthExpenseNum);
      }
    }
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

      // 保存当前开销数值并计算预算
      this.setData({
        totalBalance: totalBalance.toFixed(2),
        monthIncome: monthIncome.toFixed(2),
        monthExpense: monthExpense.toFixed(2),
        monthExpenseNum: monthExpense,
        recentBills: recentBills,
        loading: false
      }, () => {
        this.calculateBudget(monthExpense);
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

  // 计算预算进度
  calculateBudget(expenseAmount) {
    const budget = this.data.monthlyBudget;
    if (budget <= 0) {
      this.setData({
        hasBudget: false,
        budgetRemaining: '0.00',
        budgetPercent: 0,
        budgetStatus: 'normal'
      });
      return;
    }

    const remaining = budget - expenseAmount;
    const percent = Math.min(Math.round((expenseAmount / budget) * 100), 100);
    let status = 'normal';
    if (expenseAmount > budget) {
      status = 'danger'; // 超支
    } else if (percent >= 80) {
      status = 'warning'; // 预警
    }

    this.setData({
      hasBudget: true,
      budgetRemaining: Math.abs(remaining).toFixed(2),
      isOverBudget: remaining < 0,
      budgetPercent: percent,
      budgetStatus: status
    });
  },

  // 切换金额隐藏与展示（小眼睛）
  toggleHideAmount() {
    const isHideAmount = !this.data.isHideAmount;
    this.setData({
      isHideAmount
    });
    wx.setStorageSync('isHideAmount', isHideAmount);
  },

  // 弹出设置/修改本月预算
  setBudget() {
    wx.showModal({
      title: '设置本月预算',
      editable: true,
      placeholderText: '请输入每月预算金额（元）',
      content: this.data.monthlyBudget > 0 ? String(this.data.monthlyBudget) : '',
      success: (res) => {
        if (res.confirm) {
          const val = parseFloat(res.content ? res.content.trim() : '0') || 0;
          if (val < 0) {
            wx.showToast({ title: '预算不能为负数', icon: 'none' });
            return;
          }
          wx.setStorageSync('monthlyBudget', val);
          this.setData({
            monthlyBudget: val,
            hasBudget: val > 0
          }, () => {
            this.calculateBudget(this.data.monthExpenseNum || parseFloat(this.data.monthExpense) || 0);
          });
          wx.showToast({
            title: val > 0 ? '预算设置成功' : '已清除预算',
            icon: 'success'
          });
        }
      }
    });
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

  // 跳转到统计分析页面
  goToChart() {
    wx.navigateTo({
      url: '/pages/chart/chart'
    });
  },

  // 查看账单详情
  viewBillDetail(e) {
    const billId = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/detail/detail?id=${billId}`
    });
  },

  // 加载旅行活动（本地优先秒开 + 云端静默同步）
  async loadTrips() {
    const localTrips = getTrips();
    this.setData({ trips: localTrips });

    try {
      const cloudTrips = await syncTripsFromCloud();
      if (cloudTrips && Array.isArray(cloudTrips)) {
        this.setData({ trips: cloudTrips });
      }
    } catch (e) {
      console.warn('Sync trips background warning:', e);
    }
  },

  // 跳转旅行小队工作台
  goToTripDetail(e) {
    const tripId = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/trip/trip-detail?tripId=${tripId}`
    });
  },

  // 新建旅行活动
  goToTripCreate() {
    wx.navigateTo({
      url: '/pages/trip/trip-create'
    });
  },

  // 首页卡片直接删除/解散行程
  deleteTripFromHome(e) {
    const { id, title } = e.currentTarget.dataset;
    wx.showModal({
      title: '解散旅行小队',
      content: `确定要删除行程“${title || '该行程'}”吗？\n删除后该行程的所有数据将无法恢复。`,
      confirmText: '确认删除',
      confirmColor: '#EF4444',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          deleteTrip(id);
          this.loadTrips();
          wx.showToast({ title: '行程已删除', icon: 'none' });
        }
      }
    });
  },

  // 打开口令加入小队弹窗
  openJoinModal() {
    this.setData({
      showJoinModal: true,
      joinInputCode: '',
      joinMemberName: ''
    });
  },

  // 关闭口令加入弹窗
  closeJoinModal() {
    this.setData({ showJoinModal: false });
  },

  onJoinCodeInput(e) {
    this.setData({
      joinInputCode: (e.detail.value || '').toUpperCase()
    });
  },

  onJoinNameInput(e) {
    this.setData({
      joinMemberName: e.detail.value || ''
    });
  },

  // 确认口令加入小队
  async confirmJoinTrip() {
    const code = (this.data.joinInputCode || '').trim();
    const name = (this.data.joinMemberName || '').trim();

    if (!code) {
      wx.showToast({ title: '请输入6位口令', icon: 'none' });
      return;
    }
    if (!name) {
      wx.showToast({ title: '请输入你的名字/昵称', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '正在加入小队...' });
    const res = await joinTripByCode(code, name);
    wx.hideLoading();

    if (res.success) {
      wx.showToast({ title: '成功加入小队！', icon: 'success' });
      this.closeJoinModal();
      this.loadTrips();
      setTimeout(() => {
        wx.navigateTo({
          url: `/pages/trip/trip-detail?tripId=${res.trip.id}`
        });
      }, 600);
    } else {
      wx.showToast({ title: res.msg || '加入失败', icon: 'none' });
    }
  }
})