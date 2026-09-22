// 中国法定节假日及调休休假字典（覆盖 2025、2026、2027 等常用年份）
const HOLIDAY_MAP = {
  // 2025
  '2025-01-01': { name: '元旦', rest: true },
  '2025-01-28': { name: '除夕', rest: true },
  '2025-01-29': { name: '春节', rest: true },
  '2025-01-30': { name: '初二', rest: true },
  '2025-01-31': { name: '初三', rest: true },
  '2025-02-01': { name: '初四', rest: true },
  '2025-02-02': { name: '初五', rest: true },
  '2025-02-03': { name: '初六', rest: true },
  '2025-02-04': { name: '初七', rest: true },
  '2025-04-04': { name: '清明', rest: true },
  '2025-04-05': { name: '清明', rest: true },
  '2025-04-06': { name: '清明', rest: true },
  '2025-05-01': { name: '劳动节', rest: true },
  '2025-05-02': { name: '休', rest: true },
  '2025-05-03': { name: '休', rest: true },
  '2025-05-04': { name: '休', rest: true },
  '2025-05-05': { name: '休', rest: true },
  '2025-05-31': { name: '端午', rest: true },
  '2025-06-01': { name: '端午', rest: true },
  '2025-06-02': { name: '端午', rest: true },
  '2025-10-01': { name: '国庆', rest: true },
  '2025-10-02': { name: '国庆', rest: true },
  '2025-10-03': { name: '国庆', rest: true },
  '2025-10-04': { name: '国庆', rest: true },
  '2025-10-05': { name: '国庆', rest: true },
  '2025-10-06': { name: '中秋', rest: true },
  '2025-10-07': { name: '国庆', rest: true },
  '2025-10-08': { name: '国庆', rest: true },

  // 2026
  '2026-01-01': { name: '元旦', rest: true },
  '2026-01-02': { name: '休', rest: true },
  '2026-01-03': { name: '休', rest: true },
  '2026-02-16': { name: '除夕', rest: true },
  '2026-02-17': { name: '春节', rest: true },
  '2026-02-18': { name: '初二', rest: true },
  '2026-02-19': { name: '初三', rest: true },
  '2026-02-20': { name: '初四', rest: true },
  '2026-02-21': { name: '初五', rest: true },
  '2026-02-22': { name: '初六', rest: true },
  '2026-04-04': { name: '清明', rest: true },
  '2026-04-05': { name: '清明', rest: true },
  '2026-04-06': { name: '清明', rest: true },
  '2026-05-01': { name: '劳动节', rest: true },
  '2026-05-02': { name: '休', rest: true },
  '2026-05-03': { name: '休', rest: true },
  '2026-05-04': { name: '休', rest: true },
  '2026-05-05': { name: '休', rest: true },
  '2026-06-19': { name: '端午', rest: true },
  '2026-06-20': { name: '端午', rest: true },
  '2026-06-21': { name: '端午', rest: true },
  '2026-09-25': { name: '中秋', rest: true },
  '2026-09-26': { name: '中秋', rest: true },
  '2026-09-27': { name: '中秋', rest: true },
  '2026-10-01': { name: '国庆', rest: true },
  '2026-10-02': { name: '国庆', rest: true },
  '2026-10-03': { name: '国庆', rest: true },
  '2026-10-04': { name: '国庆', rest: true },
  '2026-10-05': { name: '国庆', rest: true },
  '2026-10-06': { name: '国庆', rest: true },
  '2026-10-07': { name: '国庆', rest: true },

  // 2027
  '2027-01-01': { name: '元旦', rest: true },
  '2027-02-05': { name: '除夕', rest: true },
  '2027-02-06': { name: '春节', rest: true },
  '2027-04-05': { name: '清明', rest: true },
  '2027-05-01': { name: '劳动节', rest: true },
  '2027-06-09': { name: '端午', rest: true },
  '2027-09-15': { name: '中秋', rest: true },
  '2027-10-01': { name: '国庆', rest: true }
};

function getLocalDateStr() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

Component({
  properties: {
    visible: {
      type: Boolean,
      value: false,
      observer(newVal) {
        if (newVal) {
          this.initSelection();
          this.buildCalendar();
        }
      }
    },
    startDate: {
      type: String,
      value: '',
      observer() {
        this.initSelection();
      }
    },
    endDate: {
      type: String,
      value: '',
      observer() {
        this.initSelection();
      }
    },
    minDate: {
      type: String,
      value: ''
    },
    title: {
      type: String,
      value: '选择出行日期'
    },
    maxMonths: {
      type: Number,
      value: 6
    },
    allowPast: {
      type: Boolean,
      value: false
    },
    pastMonths: {
      type: Number,
      value: 12
    }
  },

  data: {
    today: '',
    effectiveMinDate: '',
    currentStart: '',
    currentEnd: '',
    daysCount: 0,
    months: [],
    scrollToMonthId: ''
  },

  lifetimes: {
    attached() {
      const today = getLocalDateStr();
      const allowPast = Boolean(this.properties.allowPast);
      this.setData({
        today,
        effectiveMinDate: this.properties.minDate || (allowPast ? '' : today)
      });
      this.initSelection();
      this.buildCalendar();
    }
  },

  methods: {
    initSelection() {
      const today = getLocalDateStr();
      const allowPast = Boolean(this.properties.allowPast);
      const effectiveMinDate = this.properties.minDate || (allowPast ? '' : today);
      let start = this.properties.startDate;
      let end = this.properties.endDate;

      // 如果不可选过去，且传入的开始日期早于有效最小日期，纠正为有效最小日期
      if (!allowPast && effectiveMinDate && start && start < effectiveMinDate) {
        start = effectiveMinDate;
      }
      if (end && start && end < start) {
        end = start;
      }

      const daysCount = this.computeDays(start, end);
      this.setData({
        today,
        effectiveMinDate,
        currentStart: start,
        currentEnd: end,
        daysCount
      }, () => {
        this.updateDaysHighlight();
      });
    },

    computeDays(startStr, endStr) {
      if (!startStr || !endStr) return 0;
      try {
        const s = new Date(startStr.replace(/-/g, '/'));
        const e = new Date(endStr.replace(/-/g, '/'));
        const diff = e - s;
        if (diff < 0) return 0;
        return Math.round(diff / (1000 * 60 * 60 * 24)) + 1;
      } catch (e) {
        return 0;
      }
    },

    // 构建月历网格（若开启 allowPast，支持向前展示过去月份）
    buildCalendar() {
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth(); // 0 - 11
      const monthsCount = this.properties.maxMonths || 6;
      const allowPast = Boolean(this.properties.allowPast);
      const today = this.data.today || getLocalDateStr();
      const minDate = this.properties.minDate || (allowPast ? '' : today);

      // 计算起始月份偏移
      let pastMonths = allowPast ? (this.properties.pastMonths || 12) : 0;
      // 如果已有开始日期更早，扩展 pastMonths 以便包含该月份
      const currentStart = this.data.currentStart || this.properties.startDate;
      if (allowPast && currentStart) {
        try {
          const sDate = new Date(currentStart.replace(/-/g, '/'));
          const diffMonths = (currentYear - sDate.getFullYear()) * 12 + (currentMonth - sDate.getMonth());
          if (diffMonths > pastMonths) {
            pastMonths = diffMonths + 1;
          }
        } catch (e) {}
      }

      const startOffset = -pastMonths;
      const totalMonths = pastMonths + monthsCount;

      const months = [];
      let defaultScrollMonthId = `month_${currentYear}_${currentMonth + 1}`;

      for (let i = 0; i < totalMonths; i++) {
        const offset = startOffset + i;
        const targetDate = new Date(currentYear, currentMonth + offset, 1);
        const year = targetDate.getFullYear();
        const month = targetDate.getMonth() + 1; // 1 - 12
        const monthTitle = `${year}年${month}月`;
        const monthId = `month_${year}_${month}`;

        // 当月第一天是周几 (0 为周日，1 为周一 ... 6 为周六)
        const firstDayWeek = new Date(year, month - 1, 1).getDay();
        // 当月天数
        const daysInMonth = new Date(year, month, 0).getDate();

        const days = [];

        // 占位空单元格（对齐星期）
        for (let p = 0; p < firstDayWeek; p++) {
          days.push({
            isPlaceholder: true,
            id: `empty_${year}_${month}_${p}`
          });
        }

        // 真实日期数据
        for (let d = 1; d <= daysInMonth; d++) {
          const dayStr = String(d).padStart(2, '0');
          const monthStr = String(month).padStart(2, '0');
          const dateStr = `${year}-${monthStr}-${dayStr}`;

          const dayOfWeek = new Date(year, month - 1, d).getDay();
          const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
          const isBeforeMin = minDate ? (dateStr < minDate) : false;
          const isDisabled = (!allowPast && dateStr < today) || isBeforeMin;
          const isToday = dateStr === today;

          // 节假日与调休判定
          let holidayName = '';
          let isRest = false;
          if (HOLIDAY_MAP[dateStr]) {
            holidayName = HOLIDAY_MAP[dateStr].name;
            isRest = Boolean(HOLIDAY_MAP[dateStr].rest);
          } else if (dateStr.endsWith('-01-01')) {
            holidayName = '元旦';
            isRest = true;
          } else if (dateStr.endsWith('-05-01')) {
            holidayName = '劳动节';
            isRest = true;
          } else if (dateStr.endsWith('-10-01')) {
            holidayName = '国庆节';
            isRest = true;
          }

          days.push({
            isPlaceholder: false,
            dayNumber: d,
            dateStr,
            isWeekend,
            isDisabled,
            isPast: isDisabled,
            isToday,
            holidayName,
            isRest,
            isSelectedStart: false,
            isSelectedEnd: false,
            isInRange: false,
            tipText: isToday ? '今天' : ''
          });
        }

        months.push({
          id: monthId,
          year,
          month,
          title: monthTitle,
          days
        });
      }

      // 计算滚动定位目标月份：优先聚焦已选开始日期所在月份，否则聚焦当月
      let scrollToMonthId = defaultScrollMonthId;
      if (currentStart) {
        try {
          const sDate = new Date(currentStart.replace(/-/g, '/'));
          scrollToMonthId = `month_${sDate.getFullYear()}_${sDate.getMonth() + 1}`;
        } catch (e) {}
      }

      this.setData({ months }, () => {
        this.updateDaysHighlight();
        if (scrollToMonthId) {
          setTimeout(() => {
            this.setData({ scrollToMonthId });
          }, 80);
        }
      });
    },

    // 更新高亮区间与标记
    updateDaysHighlight() {
      const { currentStart, currentEnd, months } = this.data;
      if (!months || months.length === 0) return;

      const newMonths = months.map(m => {
        const days = m.days.map(d => {
          if (d.isPlaceholder) return d;
          const isSelectedStart = Boolean(currentStart && d.dateStr === currentStart);
          const isSelectedEnd = Boolean(currentEnd && d.dateStr === currentEnd);
          const isInRange = Boolean(currentStart && currentEnd && d.dateStr > currentStart && d.dateStr < currentEnd);

          let tipText = '';
          if (isSelectedStart && isSelectedEnd) {
            tipText = '出发/返程';
          } else if (isSelectedStart) {
            tipText = '出发';
          } else if (isSelectedEnd) {
            tipText = '返程';
          } else if (d.isToday) {
            tipText = '今天';
          }

          return {
            ...d,
            isSelectedStart,
            isSelectedEnd,
            isInRange,
            tipText
          };
        });
        return { ...m, days };
      });

      this.setData({ months: newMonths });
    },

    // 点击某一天进行区间选点
    handleDayTap(e) {
      const { date, disabled, past } = e.currentTarget.dataset;
      const isDateDisabled = Boolean(disabled !== undefined ? disabled : past);
      if (isDateDisabled || !date) {
        wx.showToast({ title: '无法选择该日期', icon: 'none' });
        return;
      }

      let { currentStart, currentEnd } = this.data;

      // 选点交互逻辑：
      // 1. 如果尚未选择出发，或已经选了完整区间，或者新点击的日期早于出发日期 -> 设为新的出发日
      if (!currentStart || (currentStart && currentEnd) || date < currentStart) {
        currentStart = date;
        currentEnd = '';
      } else if (currentStart && !currentEnd) {
        // 2. 如果已选出发且无返程，点击日期大于出发日 -> 设为返程日
        if (date > currentStart) {
          currentEnd = date;
        } else if (date === currentStart) {
          // 同一天
          currentEnd = date;
        }
      }

      const daysCount = this.computeDays(currentStart, currentEnd);

      this.setData({
        currentStart,
        currentEnd,
        daysCount
      }, () => {
        this.updateDaysHighlight();
      });
    },

    // 清空重设
    handleReset() {
      this.setData({
        currentStart: '',
        currentEnd: '',
        daysCount: 0
      }, () => {
        this.updateDaysHighlight();
      });
    },

    // 确认选择
    handleConfirm() {
      const { currentStart, currentEnd, daysCount } = this.data;
      if (!currentStart) {
        wx.showToast({ title: '请选择出行出发日期', icon: 'none' });
        return;
      }

      // 如果只选了一天，默认当天往返
      const finalEnd = currentEnd || currentStart;
      const finalDays = daysCount > 0 ? daysCount : 1;

      this.triggerEvent('confirm', {
        startDate: currentStart,
        endDate: finalEnd,
        daysCount: finalDays
      });
    },

    handleClose() {
      this.triggerEvent('close');
    }
  }
});
