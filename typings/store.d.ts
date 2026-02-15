/**
 * 🏪 Store类型声明
 *
 * 定义MobX Store的类型接口，用于页面绑定时的类型推导
 *
 * @file 天工餐厅积分系统 - Store类型定义
 * @version 5.0.0
 * @since 2026-02-10
 */

declare namespace Store {
  /** 用户Store状态 */
  interface UserStore {
    isLoggedIn: boolean
    userInfo: API.UserProfile | null
    accessToken: string
    refreshToken: string
    userRole: string
    readonly isAdmin: boolean
    readonly userId: number
    readonly nickname: string
    readonly maskedMobile: string
    setLoginState(userInfo: API.UserProfile, accessToken: string, refreshToken: string): void
    updateUserInfo(userInfo: API.UserProfile): void
    updateAccessToken(token: string): void
    updateRefreshToken(token: string): void
    clearLoginState(): void
    restoreLoginState(): void
  }

  /** 积分Store状态 */
  interface PointsStore {
    availableAmount: number
    frozenAmount: number
    transactions: API.AssetTransaction[]
    transactionPagination: PaginationState
    balanceLoading: boolean
    transactionsLoading: boolean
    readonly totalAmount: number
    readonly formattedBalance: string
    setBalance(availableAmount: number, frozenAmount: number): void
    setBalanceLoading(loading: boolean): void
    setTransactions(transactions: API.AssetTransaction[], pagination: PaginationParam): void
    appendTransactions(transactions: API.AssetTransaction[], pagination: PaginationParam): void
    setTransactionsLoading(loading: boolean): void
    clearPoints(): void
  }

  /** 抽奖Store状态 */
  interface LotteryStore {
    prizes: API.Prize[]
    config: API.LotteryConfig | null
    isDrawing: boolean
    currentHighlight: number
    loading: boolean
    readonly costPerDraw: number
    readonly drawButtons: API.DrawButton[]
    readonly campaignCode: string
    readonly hasValidConfig: boolean
    setPrizes(prizes: API.Prize[]): void
    setConfig(config: API.LotteryConfig): void
    setDrawing(isDrawing: boolean): void
    setHighlight(index: number): void
    setLoading(loading: boolean): void
    clearLottery(): void
  }

  /** 兑换Store状态 */
  interface ExchangeStore {
    products: API.ExchangeProduct[]
    records: API.ExchangeOrder[]
    currentSpace: string | null
    currentCategory: string | null
    productPagination: PaginationState
    recordPagination: PaginationState
    productsLoading: boolean
    recordsLoading: boolean
    setProducts(products: API.ExchangeProduct[], pagination: PaginationParam): void
    appendProducts(products: API.ExchangeProduct[], pagination: PaginationParam): void
    setRecords(records: API.ExchangeOrder[], pagination: PaginationParam): void
    setFilter(space: string | null, category: string | null): void
    setProductsLoading(loading: boolean): void
    setRecordsLoading(loading: boolean): void
    clearExchange(): void
  }

  /** 交易Store状态 */
  interface TradeStore {
    marketListings: API.MarketListing[]
    inventoryItems: API.BackpackItem[]
    myListings: any[]
    marketPagination: PaginationState
    marketLoading: boolean
    inventoryLoading: boolean
    setMarketListings(listings: API.MarketListing[], pagination: PaginationParam): void
    appendMarketListings(listings: API.MarketListing[], pagination: PaginationParam): void
    setInventoryItems(items: API.BackpackItem[]): void
    setMyListings(listings: any[]): void
    setMarketLoading(loading: boolean): void
    setInventoryLoading(loading: boolean): void
    clearTrade(): void
  }

  /** 通用分页状态 */
  interface PaginationState {
    page: number
    pageSize: number
    total: number
    hasMore: boolean
  }

  /** 分页参数（Store方法接收的分页入参） */
  interface PaginationParam {
    page: number
    total: number
    hasMore: boolean
  }
}
