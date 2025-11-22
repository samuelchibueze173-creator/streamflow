;; title: StreamFlow
;; version: 1.0.0
;; summary: Continuous BTC-denominated payment streaming settled in STX
;; description: Enable real-time salary/subscription streams with pausability, 
;;              cliff/vesting periods, and composable Stream NFTs

;; traits
(define-trait stream-nft-trait
  (
    (get-last-token-id () (response uint uint))
    (get-token-uri (uint) (response (optional (string-ascii 256)) uint))
    (get-owner (uint) (response (optional principal) uint))
    (transfer (uint principal principal) (response bool uint))
  )
)

;; token definitions
(define-non-fungible-token stream-nft uint)

;; constants
(define-constant CONTRACT_OWNER tx-sender)
(define-constant ERR_UNAUTHORIZED (err u100))
(define-constant ERR_NOT_FOUND (err u101))
(define-constant ERR_INVALID_AMOUNT (err u102))
(define-constant ERR_INSUFFICIENT_BALANCE (err u103))
(define-constant ERR_STREAM_PAUSED (err u104))
(define-constant ERR_STREAM_ENDED (err u105))
(define-constant ERR_CLIFF_NOT_REACHED (err u106))
(define-constant ERR_ALREADY_CLAIMED (err u107))
(define-constant ERR_INVALID_PARAMS (err u108))
(define-constant ERR_TRANSFER_FAILED (err u109))
(define-constant ERR_ORACLE_ERROR (err u110))
(define-constant ERR_REENTRANCY (err u111))
(define-constant ERR_RATE_LIMIT (err u112))
(define-constant ERR_OVERFLOW (err u113))
(define-constant ERR_EMERGENCY_PAUSED (err u114))
(define-constant ERR_INVALID_RATE (err u115))
(define-constant ERR_MAX_STREAMS_REACHED (err u116))
(define-constant ERR_ORACLE_STALE (err u117))

(define-constant PRECISION u1000000) ;; 6 decimal places for rate calculations
(define-constant SECONDS_PER_BLOCK u600) ;; Average block time in seconds
(define-constant MAX_STREAM_DURATION u31536000) ;; 1 year in seconds
(define-constant MAX_STREAMS_PER_USER u50) ;; Maximum streams per user
(define-constant MIN_BTC_RATE u1) ;; Minimum BTC rate (1 satoshi per second)
(define-constant MAX_BTC_RATE u1000000000) ;; Maximum BTC rate (10 BTC per second)
(define-constant ORACLE_UPDATE_COOLDOWN u3600) ;; 1 hour cooldown for oracle updates
(define-constant MAX_RATE_CHANGE_PERCENT u10) ;; 10% max rate change per update
(define-constant EMERGENCY_WITHDRAWAL_DELAY u86400) ;; 24 hour delay for emergency withdrawals

;; Enhanced security constants
(define-constant MAX_ORACLE_STALENESS u86400) ;; 24 hours max oracle staleness
(define-constant MIN_ORACLE_UPDATE_INTERVAL u300) ;; 5 minutes minimum update interval
(define-constant MAX_BTC_RATE_CHANGE u10000000) ;; Maximum absolute BTC rate change (0.1 BTC)
(define-constant MIN_STREAM_DEPOSIT u1000) ;; Minimum stream deposit (1000 microSTX)
(define-constant MAX_BULK_OPERATIONS u20) ;; Maximum operations in bulk calls

;; data vars
(define-data-var next-stream-id uint u1)
(define-data-var next-nft-id uint u1)
(define-data-var btc-stx-rate uint u50000000) ;; BTC price in microSTX (50 STX per BTC)
(define-data-var oracle-last-update uint u0)
(define-data-var contract-paused bool false)
(define-data-var emergency-paused bool false)
(define-data-var reentrancy-lock bool false)
(define-data-var last-oracle-update uint u0)
(define-data-var emergency-withdrawal-requested uint u0)
(define-data-var emergency-withdrawal-amount uint u0)

;; data maps
(define-map streams 
  uint 
  {
    sender: principal,
    recipient: principal,
    btc-rate-per-second: uint, ;; BTC amount per second in satoshis
    start-time: uint,
    end-time: uint,
    cliff-time: uint,
    total-deposited: uint, ;; Total STX deposited
    total-claimed: uint,   ;; Total STX claimed
    paused: bool,
    pause-time: uint,
    total-paused-duration: uint,
    active: bool
  }
)

(define-map stream-nft-mapping uint uint) ;; NFT ID -> Stream ID
(define-map user-streams principal (list 100 uint))
(define-map recipient-streams principal (list 100 uint))
(define-map user-last-action principal uint) ;; Rate limiting for user actions
(define-map emergency-withdrawals principal uint) ;; Emergency withdrawal requests
(define-map authorized-oracles principal bool) ;; Authorized oracle addresses
(define-map stream-templates uint { name: (string-ascii 64), btc-rate: uint, duration: uint, cliff: uint, active: bool }) ;; Reusable stream templates
(define-map stream-milestones { stream-id: uint, milestone-id: uint } { amount: uint, description: (string-ascii 128), reached: bool, timestamp: uint })
(define-map stream-analytics uint { total-claimed-count: uint, total-paused-count: uint, last-claim-time: uint, avg-claim-amount: uint })
(define-map user-analytics principal { total-streams-created: uint, total-streams-received: uint, total-stx-streamed: uint, total-stx-received: uint })
(define-data-var next-template-id uint u1)
(define-data-var total-volume-streamed uint u0)
(define-data-var total-streams-created uint u0)


;; security helper functions

;; Check reentrancy protection
(define-private (check-reentrancy)
  (if (var-get reentrancy-lock)
    ERR_REENTRANCY
    (begin
      (var-set reentrancy-lock true)
      (ok true)
    )
  )
)

;; Release reentrancy lock
(define-private (release-reentrancy)
  (var-set reentrancy-lock false)
)

;; Check rate limiting for user actions
(define-private (check-rate-limit (user principal) (cooldown uint))
  (let 
    (
      (last-action (default-to u0 (map-get? user-last-action user)))
      (current-time (get-current-time))
    )
    (if (< (- current-time last-action) cooldown)
      ERR_RATE_LIMIT
      (begin
        (map-set user-last-action user current-time)
        (ok true)
      )
    )
  )
)

;; Safe arithmetic operations with overflow protection
(define-private (safe-add (a uint) (b uint))
  (let ((result (+ a b)))
    (if (or (< result a) (< result b))
      ERR_OVERFLOW
      (ok result)
    )
  )
)

(define-private (safe-sub (a uint) (b uint))
  (if (< a b)
    ERR_OVERFLOW
    (ok (- a b))
  )
)

(define-private (safe-mul (a uint) (b uint))
  (let ((result (* a b)))
    (if (and (> a u0) (> b u0) (or (is-eq (/ result a) b) (is-eq (/ result b) a)))
      (ok result)
      ERR_OVERFLOW
    )
  )
)

;; Validate BTC rate is within bounds
(define-private (validate-btc-rate (rate uint))
  (and (>= rate MIN_BTC_RATE) (<= rate MAX_BTC_RATE))
)

;; Check if oracle update is allowed
(define-private (can-update-oracle)
  (let 
    (
      (current-time (get-current-time))
      (last-update (var-get last-oracle-update))
    )
    (>= (- current-time last-update) ORACLE_UPDATE_COOLDOWN)
  )
)

;; Validate rate change is within limits
(define-private (validate-rate-change (old-rate uint) (new-rate uint))
  (let 
    (
      (max-change (* old-rate (/ MAX_RATE_CHANGE_PERCENT u100)))
      (min-rate (if (< old-rate max-change) u0 (- old-rate max-change)))
      (max-rate (+ old-rate max-change))
    )
    (and (>= new-rate min-rate) (<= new-rate max-rate))
  )
)

;; Enhanced oracle validation with staleness check
(define-private (validate-oracle-data (new-rate uint))
  (let
    (
      (current-time (get-current-time))
      (last-update (var-get last-oracle-update))
      (old-rate (var-get btc-stx-rate))
    )
    (and
      ;; Check rate bounds
      (validate-btc-rate new-rate)
      ;; Check oracle update cooldown
      (>= (- current-time last-update) MIN_ORACLE_UPDATE_INTERVAL)
      ;; Check rate change limits
      (validate-rate-change old-rate new-rate)
      ;; Check absolute rate change limit
      (<= (if (> new-rate old-rate) (- new-rate old-rate) (- old-rate new-rate)) MAX_BTC_RATE_CHANGE)
    )
  )
)

;; Validate principal is not contract itself
(define-private (validate-principal (principal principal))
  (not (is-eq principal (as-contract tx-sender)))
)

;; Validate stream parameters with enhanced checks
(define-private (validate-stream-params-enhanced (btc-rate uint) (duration uint) (cliff uint) (deposit uint))
  (and
    (validate-btc-rate btc-rate)
    (> duration u0)
    (<= duration MAX_STREAM_DURATION)
    (<= cliff duration)
    (>= deposit MIN_STREAM_DEPOSIT)
    ;; Additional security checks
    (> btc-rate u0)
    (> duration cliff) ;; Ensure some streaming time after cliff
    (<= deposit u1000000000) ;; Maximum deposit limit (1 STX)
  )
)

;; Check if oracle data is stale
(define-private (is-oracle-stale)
  (let
    (
      (current-time (get-current-time))
      (last-update (var-get oracle-last-update))
    )
    (> (- current-time last-update) MAX_ORACLE_STALENESS)
  )
)

;; public functions

;; Create a new payment stream
(define-public (create-stream 
    (recipient principal)
    (btc-rate-per-second uint) ;; satoshis per second
    (duration uint) ;; seconds
    (cliff-duration uint) ;; seconds
    (stx-deposit uint)) ;; microSTX to deposit
  (begin
    ;; Security checks
    ;; (try! (check-reentrancy))
    ;; (try! (check-rate-limit tx-sender u300)) ;; 5 minute cooldown
    
    (let 
      (
        (stream-id (var-get next-stream-id))
        (nft-id (var-get next-nft-id))
        (current-time (get-current-time))
        (end-time (try! (safe-add current-time duration)))
        (cliff-time (try! (safe-add current-time cliff-duration)))
        (user-stream-count (len (default-to (list) (map-get? user-streams tx-sender))))
      )
      ;; Enhanced validation
      (asserts! (not (var-get contract-paused)) ERR_UNAUTHORIZED)
      (asserts! (not (var-get emergency-paused)) ERR_EMERGENCY_PAUSED)
      (asserts! (validate-stream-params btc-rate-per-second duration cliff-duration) ERR_INVALID_PARAMS)
      (asserts! (>= stx-deposit MIN_STREAM_DEPOSIT) ERR_INVALID_AMOUNT)
      ;; (asserts! (validate-principal recipient) ERR_INVALID_PARAMS)
      (asserts! (not (is-eq recipient tx-sender)) ERR_INVALID_PARAMS)
      (asserts! (< user-stream-count MAX_STREAMS_PER_USER) ERR_MAX_STREAMS_REACHED)
      ;; ;; Check oracle data freshness
      ;; (asserts! (not (is-oracle-stale)) ERR_ORACLE_STALE)
      
      ;; Transfer STX from sender to contract
      (try! (stx-transfer? stx-deposit tx-sender (as-contract tx-sender)))
      
      ;; Create stream record
      (map-set streams stream-id {
        sender: tx-sender,
        recipient: recipient,
        btc-rate-per-second: btc-rate-per-second,
        start-time: current-time,
        end-time: end-time,
        cliff-time: cliff-time,
        total-deposited: stx-deposit,
        total-claimed: u0,
        paused: false,
        pause-time: u0,
        total-paused-duration: u0,
        active: true
      })
      
      ;; Mint Stream NFT to sender
      (try! (nft-mint? stream-nft nft-id tx-sender))
      (map-set stream-nft-mapping nft-id stream-id)
      
      ;; Update user stream lists
      (map-set user-streams tx-sender 
        (unwrap! (as-max-len? (append (default-to (list) (map-get? user-streams tx-sender)) stream-id) u100) ERR_INVALID_PARAMS))
      (map-set recipient-streams recipient
        (unwrap! (as-max-len? (append (default-to (list) (map-get? recipient-streams recipient)) stream-id) u100) ERR_INVALID_PARAMS))
      
      ;; Increment counters with overflow protection
      (var-set next-stream-id (try! (safe-add stream-id u1)))
      (var-set next-nft-id (try! (safe-add nft-id u1)))
      
      ;; Update analytics
      (update-user-analytics-deposit tx-sender stx-deposit)
      (var-set total-volume-streamed (try! (safe-add (var-get total-volume-streamed) stx-deposit)))
      (var-set total-streams-created (try! (safe-add (var-get total-streams-created) u1)))
      
      ;; Release reentrancy lock
      (release-reentrancy)
      
      (ok stream-id)
    )
  )
)

;; Claim available tokens from a stream
(define-public (claim-stream (stream-id uint))
  (begin
    ;; Security checks
    (try! (check-reentrancy))
    (try! (check-rate-limit tx-sender u60)) ;; 1 minute cooldown
    
    (let 
      (
        (stream-data (unwrap! (map-get? streams stream-id) ERR_NOT_FOUND))
        (claimable-amount (try! (get-claimable-amount stream-id)))
      )
      ;; Enhanced validation
      (asserts! (not (var-get emergency-paused)) ERR_EMERGENCY_PAUSED)
      (asserts! (is-eq tx-sender (get recipient stream-data)) ERR_UNAUTHORIZED)
      (asserts! (get active stream-data) ERR_STREAM_ENDED)
      (asserts! (> claimable-amount u0) ERR_INVALID_AMOUNT)
      (asserts! (>= (get-current-time) (get cliff-time stream-data)) ERR_CLIFF_NOT_REACHED)
      
      ;; Update stream data with overflow protection
      (let ((new-total-claimed (try! (safe-add (get total-claimed stream-data) claimable-amount))))
        (map-set streams stream-id 
          (merge stream-data { total-claimed: new-total-claimed }))
        
        ;; Transfer STX to recipient
        (try! (as-contract (stx-transfer? claimable-amount tx-sender (get recipient stream-data))))
        
        ;; Update analytics
        (update-user-analytics-claim tx-sender claimable-amount)
        
        ;; Release reentrancy lock
        (release-reentrancy)
        
        (ok claimable-amount)
      )
    )
  )
)

;; Pause/Resume stream (only sender can do this)
(define-public (toggle-stream-pause (stream-id uint))
  (begin
    ;; Security checks
    (try! (check-rate-limit tx-sender u300)) ;; 5 minute cooldown
    
    (let 
      (
        (stream-data (unwrap! (map-get? streams stream-id) ERR_NOT_FOUND))
        (current-time (get-current-time))
      )
      ;; Enhanced validation
      (asserts! (not (var-get emergency-paused)) ERR_EMERGENCY_PAUSED)
      (asserts! (is-eq tx-sender (get sender stream-data)) ERR_UNAUTHORIZED)
      (asserts! (get active stream-data) ERR_STREAM_ENDED)
      
      (if (get paused stream-data)
        ;; Resume stream
        (let ((pause-duration (try! (safe-sub current-time (get pause-time stream-data)))))
          (let ((new-total-paused (try! (safe-add (get total-paused-duration stream-data) pause-duration))))
            (map-set streams stream-id 
              (merge stream-data { 
                paused: false,
                pause-time: u0,
                total-paused-duration: new-total-paused
              }))
            (ok "Stream resumed")
          )
        )
        ;; Pause stream
        (begin
          (map-set streams stream-id 
            (merge stream-data { 
              paused: true,
              pause-time: current-time
            }))
          (ok "Stream paused")
        )
      )
    )
  )
)

;; Close stream and return remaining funds (only sender can do this)
(define-public (close-stream (stream-id uint))
  (begin
    ;; Security checks
    (try! (check-reentrancy))
    (try! (check-rate-limit tx-sender u300)) ;; 5 minute cooldown
    
    (let 
      (
        (stream-data (unwrap! (map-get? streams stream-id) ERR_NOT_FOUND))
        (remaining-balance (try! (get-remaining-balance stream-id)))
      )
      ;; Enhanced validation
      (asserts! (not (var-get emergency-paused)) ERR_EMERGENCY_PAUSED)
      (asserts! (is-eq tx-sender (get sender stream-data)) ERR_UNAUTHORIZED)
      (asserts! (get active stream-data) ERR_STREAM_ENDED)
      
      ;; Mark stream as inactive
      (map-set streams stream-id (merge stream-data { active: false }))
      
      ;; Return remaining funds to sender
      (if (> remaining-balance u0)
        (try! (as-contract (stx-transfer? remaining-balance tx-sender (get sender stream-data))))
        true
      )
      
      ;; Release reentrancy lock
      (release-reentrancy)
      
      (ok remaining-balance)
    )
  )
)

;; Update BTC/STX oracle rate (only contract owner or authorized oracle)
(define-public (update-btc-rate (new-rate uint))
  (begin
    ;; Enhanced authorization check
    (asserts! (or (is-eq tx-sender CONTRACT_OWNER) (is-some (map-get? authorized-oracles tx-sender))) ERR_UNAUTHORIZED)
    (asserts! (not (var-get emergency-paused)) ERR_EMERGENCY_PAUSED)
    (asserts! (> new-rate u0) ERR_INVALID_AMOUNT)
    
    (let ((old-rate (var-get btc-stx-rate)))
      ;; Validate all oracle data constraints
      (asserts! (validate-oracle-data new-rate) ERR_INVALID_RATE)
      
      (var-set btc-stx-rate new-rate)
      (var-set oracle-last-update (get-current-time))
      (var-set last-oracle-update (get-current-time))
      (ok true)
    )
  )
)

;; Emergency pause contract (only owner)
(define-public (toggle-contract-pause)
  (begin
    (asserts! (is-eq tx-sender CONTRACT_OWNER) ERR_UNAUTHORIZED)
    (var-set contract-paused (not (var-get contract-paused)))
    (ok (var-get contract-paused))
  )
)

;; Transfer Stream NFT
(define-public (transfer-stream-nft (nft-id uint) (sender principal) (recipient principal))
  (begin
    (asserts! (is-eq tx-sender sender) ERR_UNAUTHORIZED)
    (try! (nft-transfer? stream-nft nft-id sender recipient))
    (ok true)
  )
)

;; Emergency pause all operations (only owner)
(define-public (emergency-pause)
  (begin
    (asserts! (is-eq tx-sender CONTRACT_OWNER) ERR_UNAUTHORIZED)
    (var-set emergency-paused true)
    (ok true)
  )
)

;; Resume operations after emergency pause (only owner)
(define-public (emergency-resume)
  (begin
    (asserts! (is-eq tx-sender CONTRACT_OWNER) ERR_UNAUTHORIZED)
    (var-set emergency-paused false)
    (ok true)
  )
)

;; Request emergency withdrawal (only owner)
(define-public (request-emergency-withdrawal (amount uint))
  (begin
    (asserts! (is-eq tx-sender CONTRACT_OWNER) ERR_UNAUTHORIZED)
    (asserts! (> amount u0) ERR_INVALID_AMOUNT)
    (var-set emergency-withdrawal-requested (get-current-time))
    (var-set emergency-withdrawal-amount amount)
    (ok true)
  )
)

;; Execute emergency withdrawal after delay (only owner)
(define-public (execute-emergency-withdrawal)
  (begin
    (asserts! (is-eq tx-sender CONTRACT_OWNER) ERR_UNAUTHORIZED)
    (let 
      (
        (request-time (var-get emergency-withdrawal-requested))
        (amount (var-get emergency-withdrawal-amount))
        (current-time (get-current-time))
      )
      (asserts! (> request-time u0) ERR_INVALID_PARAMS)
      (asserts! (>= (- current-time request-time) EMERGENCY_WITHDRAWAL_DELAY) ERR_INVALID_PARAMS)
      (asserts! (> amount u0) ERR_INVALID_AMOUNT)
      
      ;; Transfer funds to owner
      (try! (as-contract (stx-transfer? amount tx-sender CONTRACT_OWNER)))
      
      ;; Reset emergency withdrawal state
      (var-set emergency-withdrawal-requested u0)
      (var-set emergency-withdrawal-amount u0)
      
      (ok amount)
    )
  )
)

;; Authorize oracle address (only owner)
(define-public (authorize-oracle (oracle principal))
  (begin
    (asserts! (is-eq tx-sender CONTRACT_OWNER) ERR_UNAUTHORIZED)
    (map-set authorized-oracles oracle true)
    (ok true)
  )
)

;; Revoke oracle authorization (only owner)
(define-public (revoke-oracle (oracle principal))
  (begin
    (asserts! (is-eq tx-sender CONTRACT_OWNER) ERR_UNAUTHORIZED)
    (map-set authorized-oracles oracle false)
    (ok true)
  )
)

;; NEW FUNCTIONALITY: Create stream template (only owner)
(define-public (create-stream-template (name (string-ascii 64)) (btc-rate uint) (duration uint) (cliff uint))
  (let ((template-id (var-get next-template-id)))
    (asserts! (is-eq tx-sender CONTRACT_OWNER) ERR_UNAUTHORIZED)
    (asserts! (validate-stream-params btc-rate duration cliff) ERR_INVALID_PARAMS)
    (asserts! (> (len name) u0) ERR_INVALID_PARAMS)
    
    (map-set stream-templates template-id {
      name: name,
      btc-rate: btc-rate,
      duration: duration,
      cliff: cliff,
      active: true
    })
    
    (var-set next-template-id (try! (safe-add template-id u1)))
    (ok template-id)
  )
)

;; NEW FUNCTIONALITY: Create stream from template
(define-public (create-stream-from-template (template-id uint) (recipient principal) (stx-deposit uint))
  (let ((template (unwrap! (map-get? stream-templates template-id) ERR_NOT_FOUND)))
    (asserts! (get active template) ERR_INVALID_PARAMS)
    (create-stream 
      recipient
      (get btc-rate template)
      (get duration template)
      (get cliff template)
      stx-deposit
    )
  )
)

;; NEW FUNCTIONALITY: Batch create streams
(define-public (batch-create-streams 
    (recipients (list 10 principal))
    (btc-rates (list 10 uint))
    (durations (list 10 uint))
    (cliff-durations (list 10 uint))
    (stx-deposits (list 10 uint)))
  (begin
    (asserts! (is-eq (len recipients) (len btc-rates)) ERR_INVALID_PARAMS)
    (asserts! (is-eq (len recipients) (len durations)) ERR_INVALID_PARAMS)
    (asserts! (is-eq (len recipients) (len cliff-durations)) ERR_INVALID_PARAMS)
    (asserts! (is-eq (len recipients) (len stx-deposits)) ERR_INVALID_PARAMS)
    
    (ok (fold batch-create-stream-helper 
      (list u0 u1 u2 u3 u4 u5 u6 u7 u8 u9)
      { 
        recipients: recipients,
        btc-rates: btc-rates,
        durations: durations,
        cliffs: cliff-durations,
        deposits: stx-deposits,
        results: (list)
      }
    ))
  )
)

;; NEW FUNCTIONALITY: Add milestone to stream (only sender)
(define-public (add-stream-milestone (stream-id uint) (milestone-id uint) (amount uint) (description (string-ascii 128)))
  (let ((stream-data (unwrap! (map-get? streams stream-id) ERR_NOT_FOUND)))
    (asserts! (is-eq tx-sender (get sender stream-data)) ERR_UNAUTHORIZED)
    (asserts! (> amount u0) ERR_INVALID_AMOUNT)
    (asserts! (> (len description) u0) ERR_INVALID_PARAMS)
    
    (map-set stream-milestones { stream-id: stream-id, milestone-id: milestone-id } {
      amount: amount,
      description: description,
      reached: false,
      timestamp: u0
    })
    (ok true)
  )
)

;; NEW FUNCTIONALITY: Mark milestone as reached (only recipient)
(define-public (mark-milestone-reached (stream-id uint) (milestone-id uint))
  (let (
    (stream-data (unwrap! (map-get? streams stream-id) ERR_NOT_FOUND))
    (milestone (unwrap! (map-get? stream-milestones { stream-id: stream-id, milestone-id: milestone-id }) ERR_NOT_FOUND))
  )
    (asserts! (is-eq tx-sender (get recipient stream-data)) ERR_UNAUTHORIZED)
    (asserts! (not (get reached milestone)) ERR_ALREADY_CLAIMED)
    
    (map-set stream-milestones { stream-id: stream-id, milestone-id: milestone-id }
      (merge milestone { reached: true, timestamp: (get-current-time) }))
    (ok true)
  )
)

;; NEW FUNCTIONALITY: Batch claim streams
(define-public (batch-claim-streams (stream-ids (list 10 uint)))
  (ok (map claim-stream-helper stream-ids))
)

;; NEW FUNCTIONALITY: Batch pause streams
(define-public (batch-pause-streams (stream-ids (list 10 uint)))
  (begin
    (asserts! (is-eq (len stream-ids) u0) ERR_INVALID_PARAMS)
    (ok (map batch-pause-stream-helper stream-ids))
  )
)

;; NEW FUNCTIONALITY: Batch resume streams
(define-public (batch-resume-streams (stream-ids (list 10 uint)))
  (begin
    (asserts! (is-eq (len stream-ids) u0) ERR_INVALID_PARAMS)
    (ok (map batch-resume-stream-helper stream-ids))
  )
)

;; NEW FUNCTIONALITY: Batch close streams
(define-public (batch-close-streams (stream-ids (list 10 uint)))
  (begin
    (asserts! (is-eq (len stream-ids) u0) ERR_INVALID_PARAMS)
    (ok (map batch-close-stream-helper stream-ids))
  )
)

;; NEW FUNCTIONALITY: Batch update oracle rates (only authorized oracles)
(define-public (batch-update-oracle-rates (rates (list 10 uint)))
  (begin
    (asserts! (or (is-eq tx-sender CONTRACT_OWNER) (is-some (map-get? authorized-oracles tx-sender))) ERR_UNAUTHORIZED)
    (asserts! (not (var-get emergency-paused)) ERR_EMERGENCY_PAUSED)
    (asserts! (> (len rates) u0) ERR_INVALID_PARAMS)
    
    (let ((old-rate (var-get btc-stx-rate)))
      ;; Validate first rate change
      (let ((first-rate (unwrap! (element-at rates u0) ERR_INVALID_PARAMS)))
        (asserts! (validate-oracle-data first-rate) ERR_INVALID_RATE)
        
        ;; Update to first rate
        (var-set btc-stx-rate first-rate)
        (var-set oracle-last-update (get-current-time))
        (var-set last-oracle-update (get-current-time))
        
        (ok true)
      )
    )
  )
)


;; read only functions

;; Get stream details
(define-read-only (get-stream (stream-id uint))
  (map-get? streams stream-id)
)

;; Calculate claimable amount for a stream
(define-read-only (get-claimable-amount (stream-id uint))
  (let 
    (
      (stream-data (unwrap! (map-get? streams stream-id) ERR_NOT_FOUND))
      (current-time (get-current-time))
      (effective-current-time (if (get paused stream-data) (get pause-time stream-data) current-time))
      (adjusted-current-time (try! (safe-sub effective-current-time (get total-paused-duration stream-data))))
      (stream-end-time (get end-time stream-data))
      (cliff-time (get cliff-time stream-data))
    )
    ;; Check if cliff period has passed
    (if (< current-time cliff-time)
      (ok u0)
      (let 
        (
          (elapsed-time (if (> adjusted-current-time stream-end-time) 
                           (try! (safe-sub stream-end-time (get start-time stream-data)))
                           (try! (safe-sub adjusted-current-time (get start-time stream-data)))))
          (btc-earned (try! (safe-mul (get btc-rate-per-second stream-data) elapsed-time)))
          (stx-earned (try! (convert-btc-to-stx btc-earned)))
          (max-claimable (get total-deposited stream-data))
          (already-claimed (get total-claimed stream-data))
          (claimable (if (> stx-earned max-claimable) max-claimable stx-earned))
        )
        (ok (if (> claimable already-claimed) (try! (safe-sub claimable already-claimed)) u0))
      )
    )
  )
)

;; Get remaining balance in stream
(define-read-only (get-remaining-balance (stream-id uint))
  (let 
    (
      (stream-data (unwrap! (map-get? streams stream-id) ERR_NOT_FOUND))
      (total-deposited (get total-deposited stream-data))
      (total-claimed (get total-claimed stream-data))
      (claimable (unwrap! (get-claimable-amount stream-id) ERR_INVALID_AMOUNT))
      (total-allocated (try! (safe-add total-claimed claimable)))
    )
    (ok (try! (safe-sub total-deposited total-allocated)))
  )
)

;; Convert BTC amount to STX using current rate
(define-read-only (convert-btc-to-stx (btc-amount uint))
  (let 
    (
      (stx-rate (var-get btc-stx-rate))
      (btc-satoshis u100000000) ;; 1 BTC = 100,000,000 satoshis
    )
    (if (is-eq stx-rate u0)
      ERR_ORACLE_ERROR
      (let ((multiplied (try! (safe-mul btc-amount stx-rate))))
        (ok (/ multiplied btc-satoshis)) ;; Convert satoshis to BTC, then to STX
      )
    )
  )
)

;; Get user's streams
(define-read-only (get-user-streams (user principal))
  (default-to (list) (map-get? user-streams user))
)

;; Get recipient's streams
(define-read-only (get-recipient-streams (recipient principal))
  (default-to (list) (map-get? recipient-streams recipient))
)

;; Get stream ID from NFT ID
(define-read-only (get-stream-from-nft (nft-id uint))
  (map-get? stream-nft-mapping nft-id)
)

;; Get current BTC/STX rate
(define-read-only (get-btc-rate)
  (var-get btc-stx-rate)
)

;; Get contract status
(define-read-only (get-contract-status)
  {
    paused: (var-get contract-paused),
    emergency-paused: (var-get emergency-paused),
    next-stream-id: (var-get next-stream-id),
    next-nft-id: (var-get next-nft-id),
    btc-rate: (var-get btc-stx-rate),
    oracle-last-update: (var-get oracle-last-update),
    reentrancy-locked: (var-get reentrancy-lock),
    emergency-withdrawal-requested: (var-get emergency-withdrawal-requested),
    emergency-withdrawal-amount: (var-get emergency-withdrawal-amount)
  }
)

;; Get security status
(define-read-only (get-security-status)
  {
    contract-paused: (var-get contract-paused),
    emergency-paused: (var-get emergency-paused),
    reentrancy-locked: (var-get reentrancy-lock),
    oracle-cooldown-active: (not (can-update-oracle)),
    emergency-withdrawal-pending: (> (var-get emergency-withdrawal-requested) u0)
  }
)

;; Check if oracle is authorized
(define-read-only (is-oracle-authorized (oracle principal))
  (is-some (map-get? authorized-oracles oracle))
)

;; NEW: Get stream template
(define-read-only (get-stream-template (template-id uint))
  (map-get? stream-templates template-id)
)

;; NEW: Get all active templates (simplified - returns template IDs)
(define-read-only (get-active-templates)
  (ok (var-get next-template-id))
)

;; NEW: Get stream milestone
(define-read-only (get-stream-milestone (stream-id uint) (milestone-id uint))
  (map-get? stream-milestones { stream-id: stream-id, milestone-id: milestone-id })
)

;; NEW: Get stream analytics
(define-read-only (get-stream-analytics (stream-id uint))
  (default-to { total-claimed-count: u0, total-paused-count: u0, last-claim-time: u0, avg-claim-amount: u0 }
    (map-get? stream-analytics stream-id))
)

;; NEW: Get user analytics
(define-read-only (get-user-analytics (user principal))
  (default-to { total-streams-created: u0, total-streams-received: u0, total-stx-streamed: u0, total-stx-received: u0 }
    (map-get? user-analytics user))
)

;; NEW: Get global analytics
(define-read-only (get-global-analytics)
  {
    total-volume-streamed: (var-get total-volume-streamed),
    total-streams-created: (var-get total-streams-created),
    total-templates: (- (var-get next-template-id) u1),
    btc-stx-rate: (var-get btc-stx-rate)
  }
)

;; OPTIMIZED: Get multiple streams at once
(define-read-only (get-streams-batch (stream-ids (list 20 uint)))
  (ok (map get-stream-safe stream-ids))
)

;; Helper for batch get
(define-private (get-stream-safe (stream-id uint))
  (default-to 
    { sender: CONTRACT_OWNER, recipient: CONTRACT_OWNER, btc-rate-per-second: u0, start-time: u0, end-time: u0, cliff-time: u0, total-deposited: u0, total-claimed: u0, paused: false, pause-time: u0, total-paused-duration: u0, active: false }
    (map-get? streams stream-id))
)

;; OPTIMIZED: Calculate multiple claimable amounts at once
(define-read-only (get-claimable-amounts-batch (stream-ids (list 20 uint)))
  (ok (map get-claimable-safe stream-ids))
)

;; Helper for batch claimable calculation
(define-private (get-claimable-safe (stream-id uint))
  (match (get-claimable-amount stream-id)
    success success
    error u0
  )
)

;; NFT functions for composability
(define-read-only (get-last-token-id)
  (ok (- (var-get next-nft-id) u1))
)

(define-read-only (get-token-uri (nft-id uint))
  (ok (some "https://streamflow.btc/metadata/"))
)

(define-read-only (get-owner (nft-id uint))
  (ok (nft-get-owner? stream-nft nft-id))
)

;; private functions

;; Get current block time (approximation)
(define-private (get-current-time)
  (* stacks-block-height SECONDS_PER_BLOCK)
)

;; Validate stream parameters
(define-private (validate-stream-params (btc-rate uint) (duration uint) (cliff uint))
  (and 
    (validate-btc-rate btc-rate)
    (> duration u0)
    (<= duration MAX_STREAM_DURATION)
    (<= cliff duration)
  )
)

;; Helper for batch create streams
(define-private (batch-create-stream-helper (index uint) (data { recipients: (list 10 principal), btc-rates: (list 10 uint), durations: (list 10 uint), cliffs: (list 10 uint), deposits: (list 10 uint), results: (list 10 uint) }))
  (let (
    (recipient (unwrap-panic (element-at (get recipients data) index)))
    (btc-rate (unwrap-panic (element-at (get btc-rates data) index)))
    (duration (unwrap-panic (element-at (get durations data) index)))
    (cliff (unwrap-panic (element-at (get cliffs data) index)))
    (deposit (unwrap-panic (element-at (get deposits data) index)))
  )
    (match (create-stream recipient btc-rate duration cliff deposit)
      success (merge data { results: (unwrap-panic (as-max-len? (append (get results data) success) u10)) })
      error data
    )
  )
)

;; Helper for batch pause
(define-private (batch-pause-stream-helper (stream-id uint))
  (match (toggle-stream-pause stream-id)
    success (if (is-eq success "Stream paused") true false)
    error false
  )
)

;; Helper for batch resume
(define-private (batch-resume-stream-helper (stream-id uint))
  (match (toggle-stream-pause stream-id)
    success (if (is-eq success "Stream resumed") true false)
    error false
  )
)

;; Helper for batch close
(define-private (batch-close-stream-helper (stream-id uint))
  (match (close-stream stream-id)
    success true
    error false
  )
)

;; Helper for batch claim
(define-private (claim-stream-helper (stream-id uint))
  (match (claim-stream stream-id)
    success success
    error u0
  )
)

;; Update user analytics on deposit
(define-private (update-user-analytics-deposit (user principal) (amount uint))
  (let ((analytics (default-to { total-streams-created: u0, total-streams-received: u0, total-stx-streamed: u0, total-stx-received: u0 } (map-get? user-analytics user))))
    (map-set user-analytics user (merge analytics {
      total-streams-created: (+ (get total-streams-created analytics) u1),
      total-stx-streamed: (+ (get total-stx-streamed analytics) amount)
    }))
  )
)

;; Update user analytics on claim
(define-private (update-user-analytics-claim (user principal) (amount uint))
  (let ((analytics (default-to { total-streams-created: u0, total-streams-received: u0, total-stx-streamed: u0, total-stx-received: u0 } (map-get? user-analytics user))))
    (map-set user-analytics user (merge analytics {
      total-streams-received: (+ (get total-streams-received analytics) u1),
      total-stx-received: (+ (get total-stx-received analytics) amount)
    }))
  )
)