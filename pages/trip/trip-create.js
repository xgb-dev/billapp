const { createTrip, CHECKLIST_TEMPLATES } = require('../../utils/tripData.js');

Page({
  data: {
    title: '',
    destination: '',
    startDate: '',
    endDate: '',
    members: ['队长'],
    newMemberName: '',
    showEditMemberModal: false,
    editingMemberIndex: -1,
    tempMemberName: '',
    selectedTemplate: 'general',
    templates: [
      { key: 'general', name: '通用旅行', desc: '证件、洗漱用品、换洗衣物、电子设备等核心基础必备项' },
      { key: 'outdoor', name: '户外露营', desc: '帐篷睡袋、野炊锅具、手电急救、防虫防潮装备' },
      { key: 'business', name: '商务出差', desc: '正装衬衫、电脑移动电源、发票证件、名片文具' }
    ]
  },

  onLoad() {
    const today = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    this.setData({
      startDate: today,
      endDate: tomorrow
    });
  },

  onTitleInput(e) {
    this.setData({ title: e.detail.value });
  },

  onDestInput(e) {
    this.setData({ destination: e.detail.value });
  },

  onStartDateChange(e) {
    this.setData({ startDate: e.detail.value });
  },

  onEndDateChange(e) {
    this.setData({ endDate: e.detail.value });
  },

  onNewMemberInput(e) {
    this.setData({ newMemberName: e.detail.value });
  },

  // 打开成员名称修改弹窗
  openEditMemberModal(e) {
    const { index, name } = e.currentTarget.dataset;
    this.setData({
      showEditMemberModal: true,
      editingMemberIndex: Number(index),
      tempMemberName: name || ''
    });
  },

  // 关闭成员名称修改弹窗
  closeEditMemberModal() {
    this.setData({
      showEditMemberModal: false,
      editingMemberIndex: -1,
      tempMemberName: ''
    });
  },

  onMemberNameInput(e) {
    this.setData({ tempMemberName: e.detail.value || '' });
  },

  // 确认修改成员名称
  confirmEditMember() {
    const idx = this.data.editingMemberIndex;
    let name = (this.data.tempMemberName || '').trim();
    if (!name) {
      if (idx === 0) {
        name = '队长';
      } else {
        wx.showToast({ title: '请输入成员姓名', icon: 'none' });
        return;
      }
    }
    const list = [...this.data.members];
    if (list.filter((m, i) => i !== idx).includes(name)) {
      wx.showToast({ title: '小队中已有同名队员', icon: 'none' });
      return;
    }
    list[idx] = name;
    this.setData({
      members: list,
      showEditMemberModal: false
    });
    wx.showToast({ title: '名称已修改', icon: 'success' });
  },

  // 添加成员
  addMember() {
    const name = this.data.newMemberName.trim();
    if (!name) {
      wx.showToast({ title: '请输入成员姓名', icon: 'none' });
      return;
    }
    if (this.data.members.includes(name)) {
      wx.showToast({ title: '成员已存在', icon: 'none' });
      return;
    }
    this.setData({
      members: [...this.data.members, name],
      newMemberName: ''
    });
  },

  // 移除成员（队长不可移除，点击可修改名称）
  removeMember(e) {
    const idx = e.currentTarget.dataset.index;
    if (idx === 0) {
      this.openEditLeaderModal();
      return;
    }
    const list = [...this.data.members];
    list.splice(idx, 1);
    this.setData({ members: list });
  },

  // 选择模板
  selectTemplate(e) {
    this.setData({ selectedTemplate: e.currentTarget.dataset.key });
  },

  // 提交创建（写入 Supabase 云端数据库后进入详情页）
  async submitCreate() {
    const { title, destination, startDate, endDate, members, selectedTemplate } = this.data;
    if (!title.trim()) {
      wx.showToast({ title: '请填写活动名称', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '正在创建小队...', mask: true });
    try {
      const newTrip = await createTrip({
        title: title.trim(),
        destination: destination.trim() || '随性游',
        startDate,
        endDate,
        members,
        template: selectedTemplate
      });

      wx.hideLoading();
      wx.showToast({ title: '创建成功', icon: 'success' });
      setTimeout(() => {
        wx.redirectTo({
          url: `/pages/trip/trip-detail?tripId=${newTrip.id}`
        });
      }, 500);
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: '创建失败，请重试', icon: 'none' });
    }
  }
});

