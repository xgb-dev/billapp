const app = getApp();
const { 
  fetchUserTripsFromCloud,
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

  onShow() {
    this.loadTrips();
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
    const leftTripIds = wx.getStorageSync('MY_LEFT_TRIP_IDS') || [];
    const validTrips = (tripsList || []).filter(t => t && Number(t.trash || 0) !== 1 && !leftTripIds.includes(t.id));

    const enrichedTrips = validTrips.map(trip => {
      const status = getTripStatus(trip);
      const settlementInfo = getTripSettlementInfo(trip);
      return {
        ...trip,
        computedStatus: status, // 'ongoing' | 'finished'
        settlementInfo: settlementInfo
      };
    });

    const ongoingTrips = enrichedTrips.filter(t => t.computedStatus === 'ongoing');
    const historyTrips = enrichedTrips.filter(t => t.computedStatus === 'finished');
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
      wx.navigateTo({
        url: `/pages/trip/trip-detail?tripId=${tripId}`
      });
    }
  },

  goToTripCreate() {
    wx.navigateTo({
      url: '/pages/trip/trip-create'
    });
  },

  handleDeleteTrip(e) {
    const { id, title } = e.currentTarget.dataset;
    wx.showModal({
      title: '解散行程',
      content: `确定要删除行程“${title || '该行程'}”吗？\n删除后行程账单和清单将无法恢复。`,
      confirmText: '确认删除',
      confirmColor: '#EF4444',
      cancelText: '取消',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '正在删除...' });
          await deleteTrip(id);
          await this.loadTrips();
          wx.hideLoading();
          wx.showToast({ title: '行程已删除', icon: 'none' });
        }
      }
    });
  }
});

