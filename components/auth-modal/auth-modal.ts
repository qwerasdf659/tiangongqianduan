/**
 * 璁よ瘉妯℃€佹缁勪欢 - V4.0缁熶竴璁よ瘉绯荤粺
 *
 * @component auth-modal
 * @description
 * 鐢ㄦ埛韬唤楠岃瘉寮圭獥缁勪欢锛屾敮鎸佹墜鏈哄彿楠岃瘉鐮佺櫥褰曞拰鐢ㄦ埛鍚嶅瘑鐮佺櫥褰曚袱绉嶆柟寮忋€? *
 * **鏍稿績鍔熻兘**锛? * - 馃摫 鎵嬫満鍙烽獙璇佺爜鐧诲綍锛堟敮鎸佸紑鍙戦樁娈典竾鑳介獙璇佺爜123456锛? * - 馃攽 鐢ㄦ埛鍚嶅瘑鐮佺櫥褰? * - 鈴憋笍 楠岃瘉鐮佸€掕鏃讹紙60绉掞級
 * - 馃攧 琛ㄥ崟楠岃瘉鍜屾彁浜ょ姸鎬佺鐞? *
 * **涓氬姟鍦烘櫙**锛? * - 鐢ㄦ埛棣栨浣跨敤灏忕▼搴忔椂鐨勭櫥褰曞紩瀵? * - 闇€瑕佹潈闄愮殑椤甸潰寮哄埗鐧诲綍鎻愮ず
 * - Token杩囨湡鍚庣殑閲嶆柊鐧诲綍
 *
 * **鎶€鏈壒鐐?*锛? * - 瀹屽叏渚濊禆鍚庣鐪熷疄鏁版嵁锛屼笉浣跨敤mock鏁版嵁
 * - 缁熶竴浣跨敤utils/index.js瀵煎叆宸ュ叿鍑芥暟
 * - 绗﹀悎V4.0缁熶竴璁よ瘉鏋舵瀯
 * - 鑷姩娓呯悊瀹氭椂鍣ㄩ槻姝㈠唴瀛樻硠婕? *
 * **浣跨敤绀轰緥**锛? * ```xml
 * <auth-modal
 *   visible="{{showAuthModal}}"
 *   title="璇风櫥褰?
 *   isFirstUse="{{true}}"
 *   bind:success="onAuthSuccess"
 *   bind:cancel="onAuthCancel"
 * />
 * ```
 *
 * **浜嬩欢**锛? * - `success` - 鐧诲綍鎴愬姛浜嬩欢锛岃繑鍥炵敤鎴蜂俊鎭拰Token
 * - `cancel` - 鍙栨秷鐧诲綍浜嬩欢
 * - `error` - 鐧诲綍澶辫触浜嬩欢
 *
 * @file components/auth-modal/auth-modal.js
 * @version 5.0.0
 * @since 2025-10-31
 */

// 馃敶 V4.0瑙勮寖锛氱粺涓€浣跨敤utils/index.js瀵煎叆宸ュ叿鍑芥暟
const { Wechat, API, Logger } = require('../../utils/index')
const log = Logger.createLogger('auth-modal')
const { showToast } = Wechat

Component({
  /**
   * 缁勪欢鐨勫睘鎬у垪琛?   *
   * @property {boolean} visible - 鏄惁鏄剧ず寮圭獥
   * @property {string} title - 寮圭獥鏍囬
   * @property {boolean} isFirstUse - 鏄惁棣栨浣跨敤锛堢敤浜庡尯鍒嗘彁绀烘枃妗堬級
   */
  properties: {
    visible: {
      type: Boolean,
      value: false
    },
    title: {
      type: String,
      value: '韬唤楠岃瘉'
    },
    isFirstUse: {
      type: Boolean,
      value: false
    }
  },

  /**
   * 缁勪欢鐨勫唴閮ㄦ暟鎹?   *
   * @property {string} authType - 楠岃瘉鏂瑰紡锛坧hone/password锛?   * @property {string} phoneNumber - 鎵嬫満鍙?   * @property {string} verificationCode - 楠岃瘉鐮?   * @property {boolean} codeSending - 楠岃瘉鐮佸彂閫佺姸鎬?   * @property {number} countdown - 楠岃瘉鐮佸€掕鏃讹紙绉掞級
   * @property {string} username - 鐢ㄦ埛鍚?   * @property {string} password - 瀵嗙爜
   * @property {boolean} showPassword - 鏄惁鏄剧ず瀵嗙爜鏄庢枃
   * @property {boolean} submitting - 鎻愪氦鐘舵€?   * @property {boolean} canSubmit - 鏄惁鍙互鎻愪氦锛堣〃鍗曢獙璇侀€氳繃锛?   */
  data: {
    authType: 'phone',
    phoneNumber: '',
    verificationCode: '',
    codeSending: false,
    countdown: 0,
    username: '',
    password: '',
    showPassword: false,
    submitting: false,
    canSubmit: false
  },

  observers: {
    'phoneNumber, verificationCode, username, password, authType'() {
      this.updateCanSubmit()
    }
  },

  /**
   * 缁勪欢鐨勬柟娉曞垪琛?   */
  methods: {
    /**
     * 鍒囨崲楠岃瘉鏂瑰紡锛堟墜鏈哄彿/瀵嗙爜锛?     *
     * e - 寰俊灏忕▼搴忎簨浠跺璞?     * e.currentTarget.dataset - 鏁版嵁闆?     * e.currentTarget.dataset.type - 楠岃瘉鏂瑰紡绫诲瀷锛坧hone/password锛?     *
     * @description
     * 鍒囨崲楠岃瘉鏂瑰紡鏃惰嚜鍔ㄦ竻绌烘墍鏈夎緭鍏ユ暟鎹拰鐘舵€?     */
    onAuthTypeChange(e) {
      const type = e.currentTarget.dataset.type
      this.setData({
        authType: type,
        phoneNumber: '',
        verificationCode: '',
        username: '',
        password: '',
        countdown: 0,
        codeSending: false
      })
    },

    /**
     * 鎵嬫満鍙疯緭鍏ヤ簨浠?     *
     * e - 杈撳叆浜嬩欢瀵硅薄
     * e.detail - 浜嬩欢璇︽儏
     * e.detail.value - 杈撳叆鐨勬墜鏈哄彿
     */
    onPhoneInput(e) {
      this.setData({ phoneNumber: e.detail.value })
    },

    /**
     * 楠岃瘉鐮佽緭鍏ヤ簨浠?     *
     * e - 杈撳叆浜嬩欢瀵硅薄
     * e.detail.value - 杈撳叆鐨勯獙璇佺爜
     */
    onCodeInput(e) {
      this.setData({ verificationCode: e.detail.value })
    },

    /**
     * 鐢ㄦ埛鍚嶈緭鍏ヤ簨浠?     *
     * e - 杈撳叆浜嬩欢瀵硅薄
     * e.detail.value - 杈撳叆鐨勭敤鎴峰悕
     */
    onUsernameInput(e) {
      this.setData({ username: e.detail.value })
    },

    /**
     * 瀵嗙爜杈撳叆浜嬩欢
     *
     * e - 杈撳叆浜嬩欢瀵硅薄
     * e.detail.value - 杈撳叆鐨勫瘑鐮?     */
    onPasswordInput(e) {
      this.setData({ password: e.detail.value })
    },

    /**
     * 鍒囨崲瀵嗙爜鏄剧ず/闅愯棌鐘舵€?     *
     */
    onTogglePassword() {
      this.setData({ showPassword: !this.data.showPassword })
    },

    /**
     * 鍙戦€侀獙璇佺爜
     *
     *
     * @description
     * 鍙戦€佺煭淇￠獙璇佺爜鍒扮敤鎴锋墜鏈恒€?     *
     * **楠岃瘉娴佺▼**锛?     * 1. 妫€鏌ユ墜鏈哄彿鏍煎紡锛?1浣嶏紝1寮€澶达級
     * 2. 璋冪敤鍚庣API鍙戦€侀獙璇佺爜
     * 3. 寮€濮?0绉掑€掕鏃?     *
     * **寮€鍙戦樁娈?*锛?     * - 鏀寔涓囪兘楠岃瘉鐮?23456锛堢敱鍚庣瀹屽叏鎺у埗锛?     * - 涓嶅疄闄呭彂閫佺煭淇★紝闄嶄綆寮€鍙戞垚鏈?     */
    async onSendCode() {
      if (this.data.codeSending || this.data.countdown > 0) {
        return
      }

      const { phoneNumber } = this.data

      if (!phoneNumber) {
        showToast('璇疯緭鍏ユ墜鏈哄彿')
        return
      }

      // 楠岃瘉鎵嬫満鍙锋牸寮?      const phoneReg = /^1[3-9]\d{9}$/
      if (!phoneReg.test(phoneNumber)) {
        showToast('鎵嬫満鍙锋牸寮忎笉姝ｇ‘')
        return
      }

      // 鍐崇瓥8锛氬彂閫侀獙璇佺爜鍔熻兘鏆備笉鏀寔锛屽悗绔粠鏈疄鐜扮煭淇″彂閫佽矾鐢?      // 娴嬭瘯闃舵浣跨敤涓囪兘楠岃瘉鐮?123456
      wx.showToast({
        title: '鏆備笉鏀寔锛岃杈撳叆楠岃瘉鐮?,
        icon: 'none',
        duration: 2000
      })

      log.info('鈩癸笍 鍙戦€侀獙璇佺爜鏆備笉鏀寔锛堝喅绛?锛夛紝娴嬭瘯闃舵璇蜂娇鐢ㄤ竾鑳介獙璇佺爜锛?23456')
      // TODO: 绛夊悗绔帴鍏ョ煭淇℃湇鍔″悗鎭㈠鍙戦€佸姛鑳?      this.startCountdown()
    },

    /**
     * 寮€濮嬮獙璇佺爜鍊掕鏃?     *
     *
     * @description
     * 60绉掑€掕鏃讹紝鏈熼棿绂佺敤鍙戦€佹寜閽€?     * 鑷姩娓呯悊瀹氭椂鍣ㄩ槻姝㈠唴瀛樻硠婕忋€?     */
    startCountdown() {
      this.setData({ countdown: 60 })

      const timer = setInterval(() => {
        const countdown = this.data.countdown - 1
        if (countdown <= 0) {
          clearInterval(timer)
          this.setData({ countdown: 0 })
        } else {
          this.setData({ countdown })
        }
      }, 1000)

      // 淇濆瓨瀹氭椂鍣ㄥ紩鐢ㄤ互渚挎竻鐞?      this.countdownTimer = timer
    },

    /**
     * 鏇存柊鎻愪氦鎸夐挳鐘舵€?     *
     *
     * @description
     * 鏍规嵁褰撳墠楠岃瘉鏂瑰紡鍜岃緭鍏ュ唴瀹癸紝鍔ㄦ€佹洿鏂版彁浜ゆ寜閽殑鍙敤鐘舵€併€?     *
     * **楠岃瘉瑙勫垯**锛?     * - 鎵嬫満鍙锋柟寮忥細蹇呴』濉啓鎵嬫満鍙峰拰楠岃瘉鐮?     * - 瀵嗙爜鏂瑰紡锛氬繀椤诲～鍐欑敤鎴峰悕鍜屽瘑鐮?     */
    updateCanSubmit() {
      let canSubmit = false

      if (this.data.authType === 'phone') {
        canSubmit = this.data.phoneNumber && this.data.verificationCode
      } else if (this.data.authType === 'password') {
        canSubmit = this.data.username && this.data.password
      }

      this.setData({ canSubmit })
    },

    /**
     * 纭楠岃瘉锛堜富鏂规硶锛?     *
     *
     * @description
     * 鏍规嵁褰撳墠楠岃瘉鏂瑰紡璋冪敤瀵瑰簲鐨勯獙璇佹柟娉?     */
    async onConfirm() {
      if (!this.data.canSubmit || this.data.submitting) {
        return
      }

      if (this.data.authType === 'phone') {
        await this.performPhoneAuth()
      } else {
        await this.performPasswordAuth()
      }
    },

    /**
     * 鎵ц鎵嬫満楠岃瘉鐮佺櫥褰?     *
     *
     * @description
     * 浣跨敤鎵嬫満鍙峰拰楠岃瘉鐮佺櫥褰曠郴缁熴€?     *
     * **V4.0鐗规€?*锛?     * - 璋冪敤utils/api.js鐨剈serLogin鏂规硶
     * - 瀹屽叏浣跨敤鍚庣鐪熷疄鏁版嵁锛屼笉鐢熸垚mock鏁版嵁
     * - 鏀寔寮€鍙戦樁娈典竾鑳介獙璇佺爜123456锛堢敱鍚庣鎺у埗锛?     * - 缁熶竴閿欒澶勭悊鍜屾彁绀?     *
     */
    async performPhoneAuth() {
      const { phoneNumber, verificationCode } = this.data

      try {
        this.setData({ submitting: true })

        // 馃敶 浣跨敤API宸ュ叿涓殑鐧诲綍鏂规硶锛屼笉鍐嶇敓鎴愭ā鎷熸暟鎹?        const result = await API.userLogin(phoneNumber, verificationCode)

        if (result.success) {
          // 馃敶 浣跨敤鍚庣杩斿洖鐨勭湡瀹炵敤鎴锋暟鎹紝涓嶅啀鐢熸垚妯℃嫙鏁版嵁
          this.handleAuthSuccess(result.data)
        } else {
          throw new Error(result.message || '楠岃瘉澶辫触')
        }
      } catch (error: any) {
        log.error('鉂?鎵嬫満楠岃瘉澶辫触:', error)
        showToast(error.message || '楠岃瘉澶辫触锛岃閲嶈瘯')
      } finally {
        this.setData({ submitting: false })
      }
    },

    /**
     * 鎵ц瀵嗙爜鐧诲綍
     *
     *
     * @description
     * 浣跨敤鐢ㄦ埛鍚嶅拰瀵嗙爜鐧诲綍绯荤粺銆?     *
     * **V4.0鐗规€?*锛?     * - 璋冪敤缁熶竴鐨凙PI鎺ュ彛
     * - 瀹屽叏浣跨敤鍚庣鐪熷疄鏁版嵁
     * - 缁熶竴閿欒澶勭悊
     *
     */
    async performPasswordAuth() {
      const { username, password } = this.data

      try {
        this.setData({ submitting: true })

        // 浣跨敤缁熶竴鐨凙PI鎺ュ彛
        const result = await API.userLogin(username, password)

        if (result.success) {
          this.handleAuthSuccess(result.data)
        } else {
          throw new Error(result.message || '鐧诲綍澶辫触')
        }
      } catch (error: any) {
        log.error('鉂?瀵嗙爜楠岃瘉澶辫触:', error)
        showToast(error.message || '鐧诲綍澶辫触锛岃閲嶈瘯')
      } finally {
        this.setData({ submitting: false })
      }
    },

    /**
     * 澶勭悊楠岃瘉鎴愬姛
     *
     * data - 鍚庣杩斿洖鐨勭櫥褰曟暟鎹?     * data.user - 鐢ㄦ埛淇℃伅
     * data.token - 璁块棶浠ょ墝
     *
     * @description
     * 鐧诲綍鎴愬姛鍚庤Е鍙憇uccess浜嬩欢锛岄€氱煡鐖剁粍浠舵洿鏂扮姸鎬併€?     * 1绉掑悗鑷姩鍏抽棴寮圭獥銆?     */
    handleAuthSuccess(data) {
      showToast('楠岃瘉鎴愬姛')

      // 閫氱煡鐖剁粍浠?      this.triggerEvent('success', {
        user: data.user,
        token: data.token
      })

      // 寤惰繜鍏抽棴寮圭獥
      setTimeout(() => {
        this.onCancel()
      }, 1000)
    },

    /**
     * 蹇樿瀵嗙爜鐐瑰嚮浜嬩欢
     *
     *
     * @description
     * 蹇樿瀵嗙爜鍔熻兘锛堥鐣欐帴鍙ｏ級
     */
    onForgotPassword() {
      showToast('蹇樿瀵嗙爜鍔熻兘寮€鍙戜腑')
    },

    /**
     * 鍙栨秷鐧诲綍
     *
     *
     * @description
     * 瑙﹀彂cancel浜嬩欢骞堕噸缃墍鏈夋暟鎹?     */
    onCancel() {
      this.triggerEvent('cancel')
      this.resetData()
    },

    /**
     * 閲嶇疆缁勪欢鏁版嵁
     *
     *
     * @description
     * 娓呯┖鎵€鏈夎緭鍏ユ暟鎹€佸畾鏃跺櫒鍜岀姸鎬侊紝鎭㈠鍒濆鐘舵€併€?     * 闃叉鍐呭瓨娉勬紡銆?     */
    resetData() {
      // 娓呯悊瀹氭椂鍣?      if (this.countdownTimer) {
        clearInterval(this.countdownTimer)
        this.countdownTimer = null
      }

      this.setData({
        authType: 'phone',
        phoneNumber: '',
        verificationCode: '',
        username: '',
        password: '',
        showPassword: false,
        codeSending: false,
        countdown: 0,
        submitting: false,
        canSubmit: false
      })
    },

    /**
     * 闃绘浜嬩欢鍐掓场
     *
     *
     * @description
     * 闃绘寮圭獥鍐呴儴鐐瑰嚮浜嬩欢鍐掓场鍒扮埗缁勪欢
     */
    preventBubble() {
      // 绌哄嚱鏁帮紝闃绘浜嬩欢鍐掓场
    }
  },

  /**
   * 缁勪欢鐢熷懡鍛ㄦ湡
   */
  lifetimes: {
    /**
     * 缁勪欢閿€姣佹椂鐨勬竻鐞嗗伐浣?     *
     *
     * @description
     * 娓呯悊瀹氭椂鍣紝闃叉鍐呭瓨娉勬紡
     */
    detached() {
      // 缁勪欢閿€姣佹椂娓呯悊瀹氭椂鍣?      if (this.countdownTimer) {
        clearInterval(this.countdownTimer)
      }
    }
  }
})

export {}
