
import { NextResponse } from "next/server";
import Stripe from "stripe";
import crypto from 'crypto';
import connectDB from '@/lib/mongodb';
import Order from '@/models/Order';
import Product from '@/models/Product';
import User from '@/models/User';
import Address from '@/models/Address';
import Store from '@/models/Store';
import Coupon from '@/models/Coupon';
import GuestUser from '@/models/GuestUser';
import { sendOrderConfirmationEmail } from '@/lib/email';

const PaymentMethod = {
    COD: 'COD',
    STRIPE: 'STRIPE'
};



export async function POST(request) {
    try {
        await connectDB();
        
        // Parse and log request
        const headersObj = Object.fromEntries(request.headers.entries());
        let bodyText = '';
        try { bodyText = await request.text(); } catch (err) { bodyText = '[unreadable]'; }
        let body = {};
        try { body = JSON.parse(bodyText); } catch (err) { body = { raw: bodyText }; }
        console.log('ORDER API: Incoming request', { method: request.method, headers: headersObj, body });

        // Extract fields
        const { addressId, addressData, items, couponCode, paymentMethod, isGuest, guestInfo } = body;
        let userId = null;
        let isPlusMember = false;

        console.log('ORDER API: Full body:', JSON.stringify(body, null, 2));
        console.log('ORDER API: isGuest value:', isGuest, 'type:', typeof isGuest);
        console.log('ORDER API: guestInfo exists:', !!guestInfo);

        // Auth for logged-in user - ONLY if explicitly NOT a guest
        if (isGuest !== true) {
            console.log('ORDER API: Not a guest order (isGuest !== true), checking auth header...');
            const authHeader = request.headers.get('authorization');
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                console.log('ORDER API: No valid auth header found. isGuest:', isGuest);
                return NextResponse.json({ 
                    error: 'Authentication required for non-guest orders',
                    isGuest: isGuest,
                    hasAuthHeader: !!authHeader
                }, { status: 401 });
            }
            const idToken = authHeader.split('Bearer ')[1];
            try {
                const { getAuth } = await import('firebase-admin/auth');
                const { initializeApp, cert, getApps } = await import('firebase-admin/app');
                if (getApps().length === 0) {
                    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}');
                    initializeApp({ credential: cert(serviceAccount) });
                }
                const decodedToken = await getAuth().verifyIdToken(idToken);
                userId = decodedToken.uid;
                isPlusMember = decodedToken.plan === 'plus';
            } catch (err) {
                console.error('Token verification error:', err);
                return NextResponse.json({ error: 'Token verification failed', details: err?.message || err }, { status: 401 });
            }
        }

        // Validation
        if (isGuest === true) {
            console.log('ORDER API: Validating guest order...');
            const missingFields = [];
            if (!guestInfo) missingFields.push('guestInfo');
            else {
                if (!guestInfo.name) missingFields.push('name');
                if (!guestInfo.email) missingFields.push('email');
                if (!guestInfo.phone) missingFields.push('phone');
                if (!guestInfo.address && !guestInfo.street) missingFields.push('address');
                if (!guestInfo.city) missingFields.push('city');
                if (!guestInfo.state) missingFields.push('state');
                if (!guestInfo.country) missingFields.push('country');
            }
            console.log('ORDER API DEBUG: guestInfo received:', guestInfo);
            console.log('ORDER API DEBUG: missingFields:', missingFields);
            if (missingFields.length > 0) {
                return NextResponse.json({ error: 'missing guest information', missingFields, guestInfo }, { status: 400 });
            }
            if (!paymentMethod || !items || !Array.isArray(items) || items.length === 0) {
                return NextResponse.json({ error: 'missing order details.', details: { paymentMethod, items }, guestInfo }, { status: 400 });
            }
        } else {
            if (!userId || !paymentMethod || !items || !Array.isArray(items) || items.length === 0) {
                return NextResponse.json({ error: 'missing order details.' }, { status: 400 });
            }
        }

        // Coupon logic
        let coupon = null;
        if (couponCode) {
            coupon = await Coupon.findOne({ code: couponCode }).lean();
            if (!coupon) return NextResponse.json({ error: 'Coupon not found' }, { status: 400 });
            if (coupon.forNewUser) {
                const userorders = await Order.find({ userId }).lean();
                if (userorders.length > 0) return NextResponse.json({ error: 'Coupon valid for new users' }, { status: 400 });
            }
            if (coupon.forMember && !isPlusMember) {
                return NextResponse.json({ error: 'Coupon valid for members only' }, { status: 400 });
            }
        }

        // Group items by store
        const ordersByStore = new Map();
        let grandSubtotal = 0;
        for (const item of items) {
            const product = await Product.findById(item.id).lean();
            if (!product) return NextResponse.json({ error: 'Product not found', id: item.id }, { status: 400 });
            const storeId = product.storeId;
            if (!ordersByStore.has(storeId)) ordersByStore.set(storeId, []);
            ordersByStore.get(storeId).push({ ...item, price: product.price });
            grandSubtotal += Number(product.price) * Number(item.quantity);
        }

        // Shipping: use from payload, fallback to 0
        let shippingFee = typeof body.shippingFee === 'number' ? body.shippingFee : 0;
        let isShippingFeeAdded = false;

        // Order creation
        let orderIds = [];
        let fullAmount = 0;
        for (const [storeId, sellerItems] of ordersByStore.entries()) {
            // Ensure user exists in DB (upsert)
            if (userId) {
                await User.findOneAndUpdate(
                    { _id: userId },
                    { $setOnInsert: { _id: userId, name: '', email: '', image: '', cart: {} } },
                    { upsert: true, new: true }
                );
            }
            
            // Existence checks
            if (userId) {
                const userExists = await User.findById(userId);
                if (!userExists) {
                    return NextResponse.json({ error: 'User not found' }, { status: 400 });
                }
            }
            if (addressId) {
                const addressExists = await Address.findById(addressId);
                if (!addressExists) {
                    return NextResponse.json({ error: 'Address not found' }, { status: 400 });
                }
            }
            if (storeId) {
                const storeExists = await Store.findById(storeId);
                if (!storeExists) {
                    return NextResponse.json({ error: 'Store not found' }, { status: 400 });
                }
            }
            
            let total = sellerItems.reduce((acc, item) => acc + (item.price * item.quantity), 0);
            if (couponCode && coupon) {
                if (coupon.discountType === 'percentage') {
                    total -= (total * coupon.discount) / 100;
                } else {
                    total -= Math.min(coupon.discount, total);
                }
            }
            if (!isPlusMember && !isShippingFeeAdded) {
                total += shippingFee;
                isShippingFeeAdded = true;
            }
            fullAmount += parseFloat(total.toFixed(2));

            // Prepare order data
            const orderData = {
                storeId: storeId,
                total: parseFloat(total.toFixed(2)),
                shippingFee: shippingFee,
                paymentMethod,
                isCouponUsed: !!coupon,
                coupon: coupon || {},
                orderItems: sellerItems.map(item => ({
                    productId: item.id,
                    quantity: item.quantity,
                    price: item.price
                }))
            };

            if (isGuest) {
                // Robust upsert for guest user
                await User.findOneAndUpdate(
                    { _id: 'guest' },
                    { $setOnInsert: { _id: 'guest', name: 'Guest User', email: 'guest@system.local', image: '', cart: [] } },
                    { upsert: true, new: true }
                );
                
                // Only create and assign guest address if address fields are present
                if (guestInfo.address || guestInfo.street) {
                    const guestAddress = await Address.create({
                        userId: 'guest',
                        name: guestInfo.name,
                        email: guestInfo.email,
                        phone: guestInfo.phone,
                        street: guestInfo.address || guestInfo.street,
                        city: guestInfo.city || 'Guest',
                        state: guestInfo.state || 'Guest',
                        zip: guestInfo.zip || '000000',
                        country: guestInfo.country || 'UAE'
                    });
                    orderData.addressId = guestAddress._id.toString();
                    orderData.shippingAddress = {
                        name: guestInfo.name,
                        email: guestInfo.email,
                        phone: guestInfo.phone,
                        street: guestInfo.address || guestInfo.street,
                        city: guestInfo.city || 'Guest',
                        state: guestInfo.state || 'Guest',
                        zip: guestInfo.zip || '000000',
                        country: guestInfo.country || 'UAE',
                        district: guestInfo.district || ''
                    };
                }
                orderData.isGuest = true;
                orderData.guestName = guestInfo.name;
                orderData.guestEmail = guestInfo.email;
                orderData.guestPhone = guestInfo.phone;

                // Upsert guestUser record
                const convertToken = crypto.randomBytes(32).toString('hex');
                const tokenExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
                await GuestUser.findOneAndUpdate(
                    { email: guestInfo.email },
                    {
                        name: guestInfo.name,
                        phone: guestInfo.phone,
                        convertToken,
                        tokenExpiry
                    },
                    { upsert: true, new: true }
                );
            } else {
                if (typeof userId === 'string' && userId.trim() !== '') {
                    orderData.userId = userId;
                }
                // Handle address - either from addressId or addressData
                if (typeof addressId === 'string' && addressId.trim() !== '') {
                    orderData.addressId = addressId;
                    // Fetch and store address data as embedded document
                    const address = await Address.findById(addressId).lean();
                    if (address) {
                        orderData.shippingAddress = {
                            name: address.name,
                            email: address.email,
                            phone: address.phone,
                            street: address.street,
                            city: address.city,
                            state: address.state,
                            zip: address.zip,
                            country: address.country,
                            district: address.district || ''
                        };
                    }
                } else if (addressData && addressData.street) {
                    // User provided address data inline - save it and use it
                    const newAddress = await Address.create({
                        userId: userId,
                        name: addressData.name,
                        email: addressData.email,
                        phone: addressData.phone,
                        street: addressData.street,
                        city: addressData.city,
                        state: addressData.state,
                        zip: addressData.zip,
                        country: addressData.country,
                        district: addressData.district || ''
                    });
                    orderData.addressId = newAddress._id.toString();
                    orderData.shippingAddress = {
                        name: addressData.name,
                        email: addressData.email,
                        phone: addressData.phone,
                        street: addressData.street,
                        city: addressData.city,
                        state: addressData.state,
                        zip: addressData.zip,
                        country: addressData.country,
                        district: addressData.district || ''
                    };
                }
                console.log('FINAL orderData before Order.create:', JSON.stringify(orderData, null, 2));
            }

            // Create order
            console.log('ORDER API DEBUG: orderData keys:', Object.keys(orderData));
            console.log('ORDER API DEBUG: orderData before Order.create:', JSON.stringify(orderData, null, 2));
            
            const order = await Order.create(orderData);
            
            // Populate order with related data
            const populatedOrder = await Order.findById(order._id)
                .populate('userId')
                .populate({
                    path: 'orderItems.productId',
                    model: 'Product'
                });
            
            orderIds.push(order._id.toString());

            // Email notification
            try {
                let customerEmail = '';
                let customerName = '';

                if (isGuest) {
                    customerEmail = guestInfo.email;
                    customerName = guestInfo.name;
                } else {
                    const user = await User.findById(userId).lean();
                    customerEmail = user?.email || '';
                    customerName = user?.name || '';
                }

                // Send order confirmation email to customer using Nodemailer
                if (customerEmail) {
                    const { sendOrderEmail } = await import('@/lib/nodemailer');
                    await sendOrderEmail({
                        to: customerEmail,
                        subject: 'Order Confirmation',
                        html: `<p>Dear ${customerName},</p><p>Your order has been received and is being processed.</p><p>Thank you for shopping with us!</p>`
                    });
                    console.log('Nodemailer order confirmation sent to customer:', customerEmail);
                }
                // Send order notification to admin using Nodemailer
                if (process.env.ADMIN_EMAIL) {
                    const { sendOrderEmail } = await import('@/lib/nodemailer');
                    await sendOrderEmail({
                        to: process.env.ADMIN_EMAIL,
                        subject: 'New Order Received',
                        html: `<p>New order placed by ${customerName} (${customerEmail}).</p>`
                    });
                    console.log('Nodemailer order notification sent to admin:', process.env.ADMIN_EMAIL);
                }
            } catch (emailError) {
                console.error('Error sending EmailJS auto-reply:', emailError);
                // Don't fail the order if email fails
            }
        }

        // Coupon usage count
        if (couponCode && coupon) {
            await Coupon.findOneAndUpdate(
                { code: couponCode },
                { $inc: { usedCount: 1 } }
            );
        }

        // Stripe payment
        if (paymentMethod === 'STRIPE') {
            const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
            const origin = await request.headers.get('origin');
            const session = await stripe.checkout.sessions.create({
                payment_method_types: ['card'],
                line_items: [{
                    price_data: {
                        currency: '₹',
                        product_data: { name: 'Order' },
                        unit_amount: Math.round(fullAmount * 100)
                    },
                    quantity: 1
                }],
                expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
                mode: 'payment',
                success_url: `${origin}/loading?nextUrl=orders`,
                cancel_url: `${origin}/cart`,
                metadata: {
                    orderIds: orderIds.join(','),
                    userId,
                    appId: 'Qui'
                }
            });
            return NextResponse.json({ session });
        }

        // Clear cart for logged-in users
        if (userId) {
            await User.findByIdAndUpdate(userId, { cart: {} });
        }

        // Return orders
        if (isGuest) {
            const orders = await Order.find({ _id: { $in: orderIds } })
                .populate('userId')
                .populate({
                    path: 'orderItems.productId',
                    model: 'Product'
                })
                .lean();
            return NextResponse.json({ message: 'Orders Placed Successfully', orders, id: orders[0]?._id.toString() });
        } else {
            // Return the last order
            const order = await Order.findById(orderIds[orderIds.length - 1])
                .populate('userId')
                .populate({
                    path: 'orderItems.productId',
                    model: 'Product'
                })
                .lean();
            return NextResponse.json({ message: 'Orders Placed Successfully', order, id: order._id.toString() });
        }
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.code || error.message }, { status: 400 });
    }
}

// Get all orders for a user
export async function GET(request) {
    try {
        await connectDB();
        
        const { searchParams } = new URL(request.url);
        const orderId = searchParams.get('orderId');
        
        // If orderId is provided, allow guest access to fetch that specific order
        if (orderId) {
            console.log('GET /api/orders: Fetching order by orderId:', orderId);
            try {
                const order = await Order.findById(orderId)
                    .populate({
                        path: 'orderItems.productId',
                        model: 'Product'
                    })
                    .populate('addressId')
                    .lean();
                
                if (!order) {
                    console.log('GET /api/orders: Order not found');
                    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
                }
                
                console.log('GET /api/orders: Order found, isGuest:', order.isGuest);
                return NextResponse.json({ order });
            } catch (err) {
                console.error('GET /api/orders: Error fetching order:', err);
                return NextResponse.json({ error: 'Invalid order ID' }, { status: 400 });
            }
        }
        
        // For listing orders (no orderId), require authentication
        const authHeader = request.headers.get('authorization');
        let userId = null;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const idToken = authHeader.split('Bearer ')[1];
            const { getAuth } = await import('firebase-admin/auth');
            const { initializeApp, applicationDefault, getApps } = await import('firebase-admin/app');
            if (getApps().length === 0) {
                initializeApp({ credential: applicationDefault() });
            }
            try {
                const decodedToken = await getAuth().verifyIdToken(idToken);
                userId = decodedToken.uid;
            } catch (e) {
                // Not signed in, userId remains null
            }
        }
        if (!userId) {
            return NextResponse.json({ error: "not authorized" }, { status: 401 });
        }
        
        const limit = parseInt(searchParams.get('limit') || '20', 10);
        const offset = parseInt(searchParams.get('offset') || '0', 10);
        
        const orders = await Order.find({
            userId,
            $or: [
                { paymentMethod: PaymentMethod.COD },
                { paymentMethod: PaymentMethod.STRIPE, isPaid: true }
            ]
        })
        .populate({
            path: 'orderItems.productId',
            model: 'Product'
        })
        .populate('addressId')
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip(offset)
        .lean();

        return NextResponse.json({ orders });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message }, { status: 400 });
    }
}