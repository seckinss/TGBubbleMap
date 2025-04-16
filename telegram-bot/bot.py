import os
import logging
import requests
import json
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import Application, CommandHandler, CallbackQueryHandler, MessageHandler, filters, ContextTypes
from dotenv import load_dotenv
import base58

# Load environment variables
load_dotenv()

# Enable logging
logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO
)
logger = logging.getLogger(__name__)


# Get environment variables
BOT_TOKEN = os.getenv('TELEGRAM_BOT_TOKEN')
API_URL = os.getenv('API_URL', 'http://localhost:3000')
# Disable logging if the environment variable is set to true
logger.disabled = os.getenv('logger', 'false') == 'true'


DEXSCREENER_API = "https://api.dexscreener.com/latest/dex/search"


def is_base58(address):
    try:
        decoded = base58.b58decode(address)
        return len(decoded) == 32
    except Exception:
        return False

# Chain mapping from DexScreener to our API
CHAIN_MAPPING = {
    "ethereum": "eth",
    "bsc": "bsc", 
    "fantom": "ftm",
    "avalanche": "avax",
    "cronos": "cro",
    "arbitrum": "arbi",
    "polygon": "poly",
    "base": "base",
    "solana": "sol",
    "sonic": "sonic"
}

async def post_init(application: Application) -> None:
    """Set up bot commands after initialization"""
    await application.bot.set_my_commands([
        ("start", "Start the bot"),
        ("help", "Show help information"),
        ("menu", "Show command menu"),
        ("bubblemap", "Generate a bubble map visualization")
    ])

# Define command handlers
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Send a message when the command /start is issued."""
    keyboard = [
        [
            InlineKeyboardButton("📋 Show Commands", callback_data='show_commands'),
            InlineKeyboardButton("🔍 Sample Bubblemap", callback_data='sample_bubblemap')
        ],
        [
            InlineKeyboardButton("ℹ️ Help", callback_data='help'),
            InlineKeyboardButton("➕ Add to Group", url=f"https://t.me/{context.bot.username}?startgroup=true")
        ]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)
    await update.message.reply_text(
        'Welcome to BubbleMap Bot! 🌐\n\n'
        'I can generate bubble map visualizations for any token.\n\n'
        'Use the command: /bubblemap to start an interactive process.\n\n'
        'Supported chains: eth, bsc, ftm, avax, cro, arbi, poly, base, sol, sonic',
        reply_markup=reply_markup
    )

async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Send a message when the command /help is issued."""
    keyboard = [
        [InlineKeyboardButton("📋 Show Menu", callback_data='show_commands')]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)
    
    await update.message.reply_text(
        'BubbleMap Bot Commands:\n\n'
        '/start - Start the bot\n'
        '/help - Show this help message\n'
        '/menu - Show command menu\n'
        '/bubblemap - Generate a bubble map visualization (interactive)\n\n'
        'To generate a bubble map, simply type /bubblemap and follow the prompts.\n'
        'You can also specify token directly: /bubblemap <token_address>',
        reply_markup=reply_markup
    )

async def menu_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Send the command menu."""
    keyboard = [
        [
            InlineKeyboardButton("📋 Show Commands", callback_data='show_commands'),
            InlineKeyboardButton("🔍 Sample Map", callback_data='sample_bubblemap')
        ],
        [
            InlineKeyboardButton("🔗 Supported Chains", callback_data='show_chains'),
            InlineKeyboardButton("ℹ️ Help", callback_data='help')
        ],
        [
            InlineKeyboardButton("➕ Add to Group", url=f"https://t.me/{context.bot.username}?startgroup=true")
        ]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)
    
    await update.message.reply_text(
        'BubbleMap Bot Menu 📋',
        reply_markup=reply_markup
    )

async def get_token_info(token_address):
    """Get token information from DexScreener API"""
    try:
        response = requests.get(f"{DEXSCREENER_API}?q={token_address}")
        response.raise_for_status()
        data = response.json()
        
        if not data.get('pairs') or len(data['pairs']) == 0:
            return None, "No token information found. Please verify the contract address."
        
        # Find pair with highest volume
        pairs = data['pairs']
        highest_volume_pair = None
        highest_volume = 0
        
        for pair in pairs:
            # Check if volume data exists and has h24 field
            if 'volume' in pair and 'h24' in pair['volume']:
                volume_h24 = pair['volume']['h24']
                if volume_h24 > highest_volume:
                    highest_volume = volume_h24
                    highest_volume_pair = pair
        
        # If no pair with volume found, fall back to first pair
        pair = highest_volume_pair if highest_volume_pair else pairs[0]
        
        # Extract chain ID and convert to our format
        chain_id = pair.get('chainId', '').lower()
        our_chain = CHAIN_MAPPING.get(chain_id)
        
        if not our_chain:
            return None, f"Chain {chain_id} not supported for bubble maps."
        
        # Get token info
        base_token = pair.get('baseToken', {})
        token_name = base_token.get('name', 'Unknown')
        token_symbol = base_token.get('symbol', 'Unknown')
        
        # Price info
        price_usd = pair.get('priceUsd', 'Unknown')
        price_native = pair.get('priceNative', 'Unknown')
        
        # Liquidity
        liquidity = pair.get('liquidity', {})
        liquidity_usd = liquidity.get('usd', 'Unknown')
        
        # Market cap and FDV
        market_cap = pair.get('marketCap', 'Unknown')
        fdv = pair.get('fdv', 'Unknown')
        
        # Volume data
        volume_h24 = highest_volume if highest_volume > 0 else 'Unknown'
        
        # Format token info message
        token_info = {
            'address': token_address,
            'name': token_name,
            'symbol': token_symbol,
            'chain': our_chain,
            'chain_original': chain_id,
            'price_usd': price_usd,
            'price_native': price_native,
            'liquidity_usd': liquidity_usd,
            'market_cap': market_cap,
            'fdv': fdv,
            'volume_h24': volume_h24,
            'pair_address': pair.get('pairAddress', 'Unknown'),
            'dex': pair.get('dexId', 'Unknown')
        }
        
        return token_info, None
    except Exception as e:
        logger.error(f"Error fetching token info: {e}")
        return None, f"Error fetching token info: {str(e)}"

# Function to fetch bubble map metadata
def get_bubblemap_metadata(chain, token_address):
    """Get bubble map metadata from Bubblemaps API"""
    try:
        url = f"https://api-legacy.bubblemaps.io/map-metadata?chain={chain}&token={token_address}"
        response = requests.get(url)
        response.raise_for_status()
        return response.json(), None
    except Exception as e:
        logger.error(f"Error fetching bubble map metadata: {e}")
        return None, f"Error fetching bubble map metadata: {str(e)}"

def format_token_info_message(token_info):
    """Format token information into a readable message"""
    message = f"*{token_info['name']} ({token_info['symbol']})*\n\n"
    message += f"🔗 *Chain:* {token_info['chain_original'].upper()}\n"
    message += f"📝 *Contract:* `{token_info['address']}`\n"
    
    # Price information
    message += f"💰 *Price:* ${token_info['price_usd']}\n"
    
    # Add volume information
    if token_info['volume_h24'] != 'Unknown':
        message += f"📊 *24h Volume:* ${format_number(token_info['volume_h24'])}\n"
    
    # Add market metrics if available
    if token_info['liquidity_usd'] != 'Unknown':
        message += f"💧 *Liquidity:* ${format_number(token_info['liquidity_usd'])}\n"
    
    if token_info['market_cap'] != 'Unknown':
        message += f"📈 *Market Cap:* ${format_number(token_info['market_cap'])}\n"
        
    if token_info['fdv'] != 'Unknown':
        message += f"🌐 *FDV:* ${format_number(token_info['fdv'])}\n"
    
    # Fetch and add BubbleMap metadata if available
    metadata, error = get_bubblemap_metadata(token_info['chain'], token_info['address'])
    if metadata and not error:
        message += "\n*BubbleMap Metrics:*\n"
        if 'decentralisation_score' in metadata:
            message += f"🏆 *Decentralization Score:* {metadata['decentralisation_score']:.2f}/100\n"
        
        if 'identified_supply' in metadata:
            identified_supply = metadata['identified_supply']
            if 'percent_in_cexs' in identified_supply:
                message += f"📊 *% in CEXs:* {identified_supply['percent_in_cexs']:.2f}%\n"
            if 'percent_in_contracts' in identified_supply:
                message += f"📝 *% in Contracts:* {identified_supply['percent_in_contracts']:.2f}%\n"
    
    return message

def format_number(number):
    """Format large numbers to be more readable"""
    if isinstance(number, str):
        try:
            number = float(number)
        except:
            return number
            
    if number is None:
        return "Unknown"
    if number >= 1_000_000_000_000:
        return f"{number / 1_000_000_000_000:.2f}T"
    elif number >= 1_000_000_000:
        return f"{number / 1_000_000_000:.2f}B"
    elif number >= 1_000_000:
        return f"{number / 1_000_000:.2f}M"
    elif number >= 1_000:
        return f"{number / 1_000:.2f}K"
    else:
        return f"{number:.2f}"

async def bubblemap_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Generate a bubble map visualization based on the given token address."""
    # Extract arguments
    args = context.args
    
    if len(args) == 0:
        # No arguments provided, ask for token address
        await update.message.reply_text(
            'Please enter the token contract address:'
        )
        # Set a flag to indicate we're waiting for token address
        context.user_data['waiting_for'] = 'token_address'
        return
    
    # Get token address from args
    token_address = args[0]
    
    # Process the token address
    await process_token_address(update, context, token_address)

async def process_token_address(update: Update, context: ContextTypes.DEFAULT_TYPE, token_address: str) -> None:
    """Process a token address by fetching info and generating bubblemap"""
    # Basic validation of contract address format
    if not (token_address.startswith('0x') and len(token_address) >= 40) and not is_base58(token_address):
        await update.message.reply_text(
            'Invalid token address format. Please provide a valid CA.'
        )
        return
    
    # Send status message
    status_message = await update.message.reply_text('Fetching token information...')
    
    # Get token information
    token_info, error = await get_token_info(token_address)
    
    if error:
        await context.bot.edit_message_text(
            chat_id=update.effective_chat.id,
            message_id=status_message.message_id,
            text=error
        )
        return
    
    # Format token info message
    token_info_message = format_token_info_message(token_info)
    
    # Update status message to indicate bubble map generation
    await context.bot.edit_message_text(
        chat_id=update.effective_chat.id,
        message_id=status_message.message_id,
        text="Generating bubble map visualization..."
    )
    
    try:
        # Get chain from token info
        chain = token_info['chain']
        
        # Request URL
        request_url = f"{API_URL}/bubble-map?token={token_address}&chain={chain}"
        logger.info(f"Making request to: {request_url}")
        
        # Make request to API
        response = requests.get(request_url, stream=True)
        response.raise_for_status()
        
        logger.info(f"API response received, status: {response.status_code}")
        
        # Create button to link to BubbleMaps website
        bubblemap_url = f"https://app.bubblemaps.io/{chain}/token/{token_address}"
        keyboard = [[InlineKeyboardButton("🔍 Check on BubbleMaps", url=bubblemap_url)]]
        reply_markup = InlineKeyboardMarkup(keyboard)
        
        # Send image to user with token info caption
        await context.bot.send_photo(
            chat_id=update.effective_chat.id,
            photo=response.content,
            caption=token_info_message,
            parse_mode="Markdown",
            reply_to_message_id=update.message.message_id,
            reply_markup=reply_markup
        )
        
        logger.info("Photo sent to user")
        
        # Delete status message
        await context.bot.delete_message(
            chat_id=update.effective_chat.id,
            message_id=status_message.message_id
        )
        
    except requests.RequestException as e:
        logger.error(f"Error generating bubble map: {e}")
        
        # Extract error message from response
        error_message = 'Error generating bubble map.\n\n'
        
        if hasattr(e, 'response') and e.response is not None:
            try:
                error_json = e.response.json()
                if 'error' in error_json:
                    # Make error messages more user-friendly
                    if "Map not computed. API key required" in error_json['error']:
                        error_message = f"No bubble map data available for this token.\n\n"
                    elif "Token not found" in error_json['error']:
                        error_message = f"Token not found on {chain}.\n\n"
                    else:
                        error_message = f"{error_json['error']}\n\n"
            except (ValueError, KeyError):
                if e.response.text and len(e.response.text) < 200:
                    error_message = f"{e.response.text}\n\n"
        
        # If bubble map couldn't be generated, send token info
        await context.bot.edit_message_text(
            chat_id=update.effective_chat.id,
            message_id=status_message.message_id,
            text=f"{error_message}{token_info_message}",
            parse_mode="Markdown"
        )

# Add handler for text messages to capture token addresses
async def handle_text_input(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle text input for the interactive bubblemap flow"""
    # If we're waiting for a token address
    if context.user_data and 'waiting_for' in context.user_data:
        if context.user_data['waiting_for'] == 'token_address':
            # Get the token address from the message
            token_address = update.message.text.strip()
            
            # Clear the waiting flag
            context.user_data.pop('waiting_for', None)
            
            # Process the token address
            await process_token_address(update, context, token_address)
            return
    
    # If not waiting for specific input, use the default unknown text handler
    if not update.message.text.startswith('/'):
        await update.message.reply_text(
            'Please use the /bubblemap command to generate a visualization.\n\n'
            'Type /help for more information.'
        )

async def button_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle button press callbacks from inline keyboards."""
    query = update.callback_query
    await query.answer()
    
    if query.data == 'show_commands':
        keyboard = [
            [
                InlineKeyboardButton("🔍 Sample Map", callback_data='sample_bubblemap'),
                InlineKeyboardButton("🔗 Supported Chains", callback_data='show_chains')
            ]
        ]
        reply_markup = InlineKeyboardMarkup(keyboard)
        
        await query.edit_message_text(
            text='Available Commands:\n\n'
                 '/start - Start the bot and show this menu\n'
                 '/help - Show help information\n'
                 '/menu - Show this command menu\n'
                 '/bubblemap - Generate a bubble map (interactive)\n\n'
                 'To generate a bubble map, simply type /bubblemap and follow the prompts.',
            reply_markup=reply_markup
        )
    
    elif query.data == 'sample_bubblemap':
        # Use a common token for demonstration (BANANA on BSC)
        sample_token = '0xc00e94cb662c3520282e6f5717214004a7f26888'
        
        # Send status message
        status_message = await context.bot.send_message(
            chat_id=update.effective_chat.id,
            text='Fetching token information...'
        )
        
        # Get token information
        token_info, error = await get_token_info(sample_token)
        
        if error:
            await context.bot.edit_message_text(
                chat_id=update.effective_chat.id,
                message_id=status_message.message_id,
                text=error
            )
            return
        
        # Format token info message
        token_info_message = format_token_info_message(token_info)
        
        # Update status message to indicate bubblemap generation
        await context.bot.edit_message_text(
            chat_id=update.effective_chat.id,
            message_id=status_message.message_id,
            text="Generating sample bubble map visualization..."
        )
        
        try:
            # Get chain from token info
            chain = token_info['chain']
            
            # Request URL
            request_url = f"{API_URL}/bubble-map?token={sample_token}&chain={chain}"
            
            # Make request to API
            response = requests.get(request_url, stream=True)
            response.raise_for_status()
            
            # Create button to link to BubbleMaps website
            bubblemap_url = f"https://app.bubblemaps.io/{chain}/token/{sample_token}"
            keyboard = [[InlineKeyboardButton("🔍 Check on BubbleMaps", url=bubblemap_url)]]
            reply_markup = InlineKeyboardMarkup(keyboard)
            
            # Send image to user with token info
            await context.bot.send_photo(
                chat_id=update.effective_chat.id,
                photo=response.content,
                caption=token_info_message,
                parse_mode="Markdown",
                reply_markup=reply_markup
            )
            
            # Delete status message
            await context.bot.delete_message(
                chat_id=update.effective_chat.id,
                message_id=status_message.message_id
            )
            
        except requests.RequestException as e:
            logger.error(f"Error generating sample bubble map: {e}")
            
            # Extract error message from response
            error_message = 'Error generating sample bubble map.\n\n'
            
            if hasattr(e, 'response') and e.response is not None:
                try:
                    error_json = e.response.json()
                    if 'error' in error_json:
                        error_message = f"{error_json['error']}\n\n"
                except (ValueError, KeyError):
                    if e.response.text and len(e.response.text) < 200:
                        error_message = f"{e.response.text}\n\n"
            
            # If bubble map couldn't be generated, just show token info
            await context.bot.edit_message_text(
                chat_id=update.effective_chat.id,
                message_id=status_message.message_id,
                text=f"{error_message}{token_info_message}",
                parse_mode="Markdown"
            )
    
    elif query.data == 'show_chains':
        await query.edit_message_text(
            text='Supported Blockchain Networks:\n\n'
                 '• eth - Ethereum\n'
                 '• bsc - Binance Smart Chain\n'
                 '• ftm - Fantom\n'
                 '• avax - Avalanche\n'
                 '• cro - Cronos\n'
                 '• arbi - Arbitrum\n'
                 '• poly - Polygon\n'
                 '• base - Base\n'
                 '• sol - Solana\n'
                 '• sonic - Sonic\n\n'
        )
    
    elif query.data == 'help':
        keyboard = [
            [
                InlineKeyboardButton("📋 Show Commands", callback_data='show_commands'),
                InlineKeyboardButton("🔗 Supported Chains", callback_data='show_chains')
            ]
        ]
        reply_markup = InlineKeyboardMarkup(keyboard)
        
        await query.edit_message_text(
            text='BubbleMap Bot Help 🌐\n\n'
                 'This bot generates visual representations of token holder distributions.\n\n'
                 'To use the bot, send the command:\n'
                 '/bubblemap\n\n'
                 'Then enter the token contract address when prompted.\n'
                 'The bot will automatically detect the chain and show token information.\n\n'
                 'You can also use the menu to see available commands and options.',
            reply_markup=reply_markup
        )

def main() -> None:
    """Start the bot."""
    # Create Application instance
    application = Application.builder().token(BOT_TOKEN).post_init(post_init).build()
    
    # Add handlers
    application.add_handler(CommandHandler("start", start))
    application.add_handler(CommandHandler("help", help_command))
    application.add_handler(CommandHandler("menu", menu_command))
    application.add_handler(CommandHandler("bubblemap", bubblemap_command))
    
    # Register callback query handler
    application.add_handler(CallbackQueryHandler(button_callback))
    
    # Register message handler - replace the unknown_text handler with the new handler
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_text_input))
    
    # Start the Bot
    application.run_polling(allowed_updates=Update.ALL_TYPES)
    logger.info("Bot started in polling mode")

if __name__ == '__main__':
    if not BOT_TOKEN:
        logger.error("TELEGRAM_BOT_TOKEN environment variable is not set")
        exit(1)
    
    main() 