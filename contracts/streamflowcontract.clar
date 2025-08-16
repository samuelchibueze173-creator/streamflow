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

(define-constant PRECISION u1000000) ;; 6 decimal places for rate calculations
(define-constant SECONDS_PER_BLOCK u600) ;; Average block time in seconds
(define-constant MAX_STREAM_DURATION u31536000) ;; 1 year in seconds

;; data vars
(define-data-var next-stream-id uint u1)
(define-data-var next-nft-id uint u1)
(define-data-var btc-stx-rate uint u50000000) ;; BTC price in microSTX (50 STX per BTC)
(define-data-var oracle-last-update uint u0)
(define-data-var contract-paused bool false)

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


;; public functions

;; Create a new payment stream
(define-public (create-stream 
    (recipient principal)
    (btc-rate-per-second uint) ;; satoshis per second
    (duration uint) ;; seconds
    (cliff-duration uint) ;; seconds
    (stx-deposit uint)) ;; microSTX to deposit
  (let 
    (
      (stream-id (var-get next-stream-id))
      (nft-id (var-get next-nft-id))
      (current-time (get-current-time))
      (end-time (+ current-time duration))
      (cliff-time (+ current-time cliff-duration))
    )
    ;; Validate inputs
    (asserts! (not (var-get contract-paused)) ERR_UNAUTHORIZED)
    (asserts! (> btc-rate-per-second u0) ERR_INVALID_PARAMS)
    (asserts! (> duration u0) ERR_INVALID_PARAMS)
    (asserts! (<= duration MAX_STREAM_DURATION) ERR_INVALID_PARAMS)
    (asserts! (<= cliff-duration duration) ERR_INVALID_PARAMS)
    (asserts! (> stx-deposit u0) ERR_INVALID_AMOUNT)
    (asserts! (not (is-eq recipient tx-sender)) ERR_INVALID_PARAMS)
    
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
    
    ;; Increment counters
    (var-set next-stream-id (+ stream-id u1))
    (var-set next-nft-id (+ nft-id u1))
    
    (ok stream-id)
  )
)

;; Claim available tokens from a stream
(define-public (claim-stream (stream-id uint))
  (let 
    (
      (stream-data (unwrap! (map-get? streams stream-id) ERR_NOT_FOUND))
      (claimable-amount (try! (get-claimable-amount stream-id)))
    )
    ;; Validate claim
    (asserts! (is-eq tx-sender (get recipient stream-data)) ERR_UNAUTHORIZED)
    (asserts! (get active stream-data) ERR_STREAM_ENDED)
    (asserts! (> claimable-amount u0) ERR_INVALID_AMOUNT)
    (asserts! (>= (get-current-time) (get cliff-time stream-data)) ERR_CLIFF_NOT_REACHED)
    
    ;; Update stream data
    (map-set streams stream-id 
      (merge stream-data { total-claimed: (+ (get total-claimed stream-data) claimable-amount) }))
    
    ;; Transfer STX to recipient
    (try! (as-contract (stx-transfer? claimable-amount tx-sender (get recipient stream-data))))
    
    (ok claimable-amount)
  )
)

;; Pause/Resume stream (only sender can do this)
(define-public (toggle-stream-pause (stream-id uint))
  (let 
    (
      (stream-data (unwrap! (map-get? streams stream-id) ERR_NOT_FOUND))
      (current-time (get-current-time))
    )
    ;; Validate authorization
    (asserts! (is-eq tx-sender (get sender stream-data)) ERR_UNAUTHORIZED)
    (asserts! (get active stream-data) ERR_STREAM_ENDED)
    
    (if (get paused stream-data)
      ;; Resume stream
      (let ((pause-duration (- current-time (get pause-time stream-data))))
        (map-set streams stream-id 
          (merge stream-data { 
            paused: false,
            pause-time: u0,
            total-paused-duration: (+ (get total-paused-duration stream-data) pause-duration)
          }))
        (ok "Stream resumed")
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

;; Close stream and return remaining funds (only sender can do this)
(define-public (close-stream (stream-id uint))
  (let 
    (
      (stream-data (unwrap! (map-get? streams stream-id) ERR_NOT_FOUND))
      (remaining-balance (try! (get-remaining-balance stream-id)))
    )
    ;; Validate authorization
    (asserts! (is-eq tx-sender (get sender stream-data)) ERR_UNAUTHORIZED)
    (asserts! (get active stream-data) ERR_STREAM_ENDED)
    
    ;; Mark stream as inactive
    (map-set streams stream-id (merge stream-data { active: false }))
    
    ;; Return remaining funds to sender
    (if (> remaining-balance u0)
      (try! (as-contract (stx-transfer? remaining-balance tx-sender (get sender stream-data))))
      true
    )
    
    (ok remaining-balance)
  )
)

;; Update BTC/STX oracle rate (only contract owner)
(define-public (update-btc-rate (new-rate uint))
  (begin
    (asserts! (is-eq tx-sender CONTRACT_OWNER) ERR_UNAUTHORIZED)
    (asserts! (> new-rate u0) ERR_INVALID_AMOUNT)
    (var-set btc-stx-rate new-rate)
    (var-set oracle-last-update (get-current-time))
    (ok true)
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
