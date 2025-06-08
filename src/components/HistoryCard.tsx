import { TokenData } from '../utils/types';
import UpArrowIcon from '../assets/img/upArrow.svg';
import TokenConfirmedIcon from '../assets/img/tokenConfirmed.svg';
import TokenNotConfirmedIcon from '../assets/img/tokenNotConfirmed.svg';
import TokenSoldIcon from '../assets/img/tokenSold.svg';
import { generateTokenIcon } from '../utils/functions';

interface HistoryCardProps {
  token: TokenData;
}

const HistoryCard = ({ token }: HistoryCardProps) => {
  return (
    <div className="history-card">
      <div className="card-header">
        <div className="token-info">
          {token.logoURI ? (
            <img 
              src={token.logoURI} 
              alt={token.tokenLabel} 
              className="token-logo" 
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <div 
              className="token-logo generated-logo"
              dangerouslySetInnerHTML={{ 
                __html: generateTokenIcon(token.baseInfo.baseAddress)
              }}
            />
          )}
          <a 
            href={`https://solscan.io/token/${token.baseInfo.baseAddress}`} 
            target="_blank" 
            rel="noopener noreferrer"
          >
            {token.tokenLabel || token.baseInfo.baseAddress.substring(0, 8) + (token.baseInfo.baseAddress.length > 8 ? '...' : '')}
          </a>
        </div>
        
        <div className="status-badge">
          {!token.sellConfirmed ? (
            <span className={`tokenStatus ${token.confirmed ? 'confirmed' : 'not-confirmed'}`}>
              {token.confirmed ? (
                <img src={TokenConfirmedIcon} alt="Confirmed" className="status-icon" />
              ) : (
                <img src={TokenNotConfirmedIcon} alt="Not Confirmed" className="status-icon" />
              )}
              <span className="status-text">{token.confirmed ? 'Confirmed' : 'Not Confirmed'}</span>
            </span>
          ) : (
            <span className="tokenStatus">
              <img src={TokenSoldIcon} alt="Sold" className="status-icon" />
              <span className="status-text">Sold</span>
            </span>
          )}
        </div>
      </div>
      
      <div className="card-body">
        {token.confirmed && token.priceInfo && (
          <div className="price-info">
            <div className="price-label">Price:</div>
            <div className="current-price">
            {token.sellConfirmed ? 
              (token.priceInfo.lastPrice > 0 ? token.priceInfo.lastPrice.toFixed(6) : token.priceInfo.currentPrice.toFixed(6)) : 
              token.priceInfo.currentPrice.toFixed(6)
            } USDC
            </div>
            <div className={`price-change ${
              token.sellConfirmed 
                ? 'positive' 
                : token.priceInfo.lastPricePercent > 0 
                    ? token.priceInfo.lastPricePercent >= 100 
                        ? 'positive' 
                        : token.priceInfo.lastPricePercent > 0.01 
                            ? 'negative' 
                            : 'lowLiquidity' 
                    : token.priceInfo.priceChangePercent >= 100 
                        ? 'positive' 
                        : token.priceInfo.priceChangePercent > 0.01 
                            ? 'negative' 
                            : 'lowLiquidity'
            }`}>
              {(token.priceInfo.lastPricePercent > 0.01 && token.priceInfo.lastPricePercent >= 100) || 
              (token.priceInfo.lastPricePercent <= 0 && token.priceInfo.priceChangePercent >= 100) 
                  ? <img src={UpArrowIcon} alt="+" className="up-arrow-icon" /> 
                  : ''}
              
              {token.priceInfo.lastPricePercent > 0.01 
                  ? parseFloat(token.priceInfo.lastPricePercent.toFixed(2)) 
                  : token.priceInfo.priceChangePercent > 0.01 
                      ? parseFloat(token.priceInfo.priceChangePercent.toFixed(2)) 
                      : "Low Liquidity"}
              
              {(token.priceInfo.lastPricePercent > 0.01 || token.priceInfo.priceChangePercent > 0.01) 
                  ? '%' 
                  : ''}
            </div>
          </div>
        )}
        
        <div className="token-dates">
          {token.confirmed && (
            <div className="date-info">
              <span className="date-label">Confirmed at:</span>
              <span className="date-value">{token.confirmedAt}</span>
            </div>
          )}
          
          {token.sellConfirmed && (
            <div className="date-info">
              <span className="date-label">Sold at:</span>
              <span className="date-value">{token.sellConfirmedAt}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default HistoryCard; 