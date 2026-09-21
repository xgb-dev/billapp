const app = getApp();
const { 
  TRIP_STATUS,
  MEMBER_STATUS,
  fetchUserTripsFromCloud,
  disbandTrip,
  hideTripForMember,
  deleteTrip, 
  getTripStatus, 
  getTripSettlementInfo 
} = require('../../utils/tripData.js');

Page({
  data: {
    activeTab: 'history', // 'history' | 'ongoing' | 'all'
    trips: [],
    ongoingTrips: [],
    historyTrips: [],
    displayTrips: [],
    loading: false
  },

  onLoad(options) {
    if (options && options.tab) {
      this.setData({ activeTab: options.tab });
    }
    this.loadTrips();
  },

  async onShow() {
    await this.loadTrips();
  },

  async onPullDownRefresh() {
    await this.loadTrips();
    wx.stopPullDownRefresh();
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    if (tab) {
      const displayTrips = (tab === 'history') 
        ? this.data.historyTrips 
        : (tab === 'ongoing' ? this.data.ongoingTrips : this.data.trips);
      this.setData({ 
        activeTab: tab,
        displayTrips
      });
    }
  },

  processAndSetTrips(tripsList) {
    const myTripRoles = wx.getStorageSync('MY_TRIP_ROLES') || {};
    const currentOid = (getApp() && getApp().globalData && getApp().globalData.openid) || wx.getStorageSync('userInfo')?.openid || '';

    const enrichedTrips = (tripsList || []).map(trip => {
      const status = getTripStatus(trip);
      const settlementInfo = getTripSettlementInfo(trip);
      const isCreator = (trip._openid && currentOid && trip._openid === currentOid) || (myTripRoles[trip.id]?.role === 'creator');
      return {
        ...trip,
        isCreator,
        computedStatus: status, // 'ACTIVE' | 'CLOSED' | 'DISBANDED'
        settlementInfo: settlementInfo
      };
    });

    const ongoingTrips = enrichedTrips.filter(t => t.computedStatus === TRIP_STATUS.ACTIVE || t.computedStatus === 'ongoing');
    const historyTrips = enrichedTrips.filter(t => t.computedStatus === TRIP_STATUS.CLOSED || t.computedStatus === 'finished');
    const activeTab = this.data.activeTab || 'history';
    const displayTrips = (activeTab === 'history') 
      ? historyTrips 
      : (activeTab === 'ongoing' ? ongoingTrips : enrichedTrips);

    this.setData({
      trips: enrichedTrips,
      ongoingTrips,
      historyTrips,
      displayTrips
    });
  },

  async loadTrips() {
    this.setData({ loading: true });
    let openid = '';
    try {
      if (app && app.ensureOpenid) {
        openid = await app.ensureOpenid();
      }
    } catch (e) {}

    try {
      const cloudTrips = await fetchUserTripsFromCloud(openid);
      this.processAndSetTrips(cloudTrips);
    } catch (e) {
      console.warn('Sync trips in trip-list error:', e);
    } finally {
      this.setData({ loading: false });
    }
  },

  goToTripDetail(e) {
    const tripId = e.currentTarget.dataset.id;
    if (tripId) {
      const trip = (this.data.trips || []).find(t => t.id === tripId);
      const isFinished = trip ? (trip.computedStatus === TRIP_STATUS.CLOSED || trip.computedStatus === 'finished') : false;
      if (isFinished) {
        wx.navigateTo({
          url: `/pages/trip/trip-history-detail?tripId=${tripId}`
        });
      } else {
        wx.navigateTo({
          url: `/pages/trip/trip-detail?tripId=${tripId}`
        });
      }
    }
  },

  goToTripCreate() {
    wx.navigateTo({
      url: '/pages/trip/trip-create'
    });
  },

  // 队长解散行程（严格校验：仅允许已结束且 AA 已结清时解散）
  handleDisbandTrip(e) {
    const { id, title } = e.currentTarget.dataset;
    const trip = (this.data.trips || []).find(t => t.id === id);
    const status = trip ? (trip.computedStatus || getTripStatus(trip)) : TRIP_STATUS.ACTIVE;

    // 1. 如果正在进行中，不可解散
    if (status === TRIP_STATUS.ACTIVE || status === 'ongoing') {
      wx.showModal({
        title: '无法直接解散',
        content: '进行中的行程请先进入工作台【结束行程】后再解散。',
        showCancel: false,
        confirmText: '我知道了',
        confirmColor: '#10B981'
      });
      return;
    }

    // 2. 检查 AA 结清
    const info = trip ? trip.settlementInfo : getTripSettlementInfo(trip);
    if (!info.isAllSettled) {
      wx.showModal({
        title: '暂无法解散行程',
        content: `当前还有 ${info.pendingCount} 笔未结清账目（待结金额 ¥${info.pendingAmount}）。\n\n为保障账务安全，请进入详情页完成 AA 结算后再解散。`,
        showCancel: false,
        confirmText: '我知道了',
        confirmColor: '#10B981'
      });
      return;
    }

    // 3. 二次确认解散
    wx.showModal({
      title: '解散行程确认',
      content: `所有账目已结清。\n确定要解散行程“${title || '该行程'}”吗？\n\n解散后所有成员都将不可见此行程，且无法恢复。`,
      confirmText: '确认解散',
      confirmColor: '#EF4444',
      cancelText: '取消',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '正在解散...' });
          const dRes = await disbandTrip(id);
          wx.hideLoading();
          if (dRes.success) {
            wx.showToast({ title: '行程已解散', icon: 'success' });
            this.loadTrips();
          } else {
            wx.showToast({ title: dRes.msg || '解散失败', icon: 'none' });
          }
        }
      }
    });
  },

  // 普通成员从个人列表中隐藏行程（不影响其他成员）
  handleHideTrip(e) {
    const { id, title } = e.currentTarget.dataset;
    wx.showModal({
      title: '移除行程确认',
      content: `确定从您的列表中移除行程“${title || '该行程'}”吗？\n\n移除后该行程不会在您的列表中显示，不影响其他小队成员。`,
      confirmText: '确认移除',
      confirmColor: '#EF4444',
      cancelText: '取消',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '正在移除...' });
          await hideTripForMember(id);
          wx.hideLoading();
          wx.showToast({ title: '已从列表中移除', icon: 'success' });
          this.loadTrips();
        }
      }
    });
  },

  // 兼容别名
  handleDeleteTrip(e) {
    this.handleDisbandTrip(e);
  }
});
