'use client'
import { useSelector } from "react-redux";
import { useMemo, useEffect, useState, lazy, Suspense } from "react";
import dynamic from "next/dynamic";
import axios from "axios";

// Critical above-the-fold components - load immediately
import Hero from "@/components/Hero";
import HomeCategories from "@/components/HomeCategories";
import LatestProducts from "@/components/LatestProducts";

// Below-the-fold components - lazy load
const BannerSlider = dynamic(() => import("@/components/BannerSlider"), { ssr: true });
const Section3 = dynamic(() => import("@/components/section3"), { ssr: false });
const Section4 = dynamic(() => import("@/components/section4"), { ssr: false });
const OriginalBrands = dynamic(() => import("@/components/OriginalBrands"), { ssr: false });
const QuickFyndCategoryDirectory = dynamic(() => import("@/components/QuickFyndCategoryDirectory"), { ssr: false });
const KeywordPills = dynamic(() => import("@/components/KeywordPills"), { ssr: false });

export default function Home() {
    const products = useSelector(state => state.product.list);
    const [adminSections, setAdminSections] = useState([]);
    const [gridSections, setGridSections] = useState([]);
    const [section4Data, setSection4Data] = useState([]);

    useEffect(() => {
        // Parallel fetch for faster loading
        const fetchData = async () => {
            try {
                const [sectionsRes, gridRes, section4Res] = await Promise.all([
                    axios.get('/api/admin/home-sections').catch(() => ({ data: { sections: [] } })),
                    axios.get('/api/admin/grid-products').catch(() => ({ data: { sections: [] } })),
                    axios.get('/api/admin/section4').catch(() => ({ data: { sections: [] } }))
                ]);
                setAdminSections(sectionsRes.data.sections || []);
                setGridSections(Array.isArray(gridRes.data.sections) ? gridRes.data.sections : []);
                setSection4Data(section4Res.data.sections || []);
            } catch (error) {
                console.error('Error fetching data:', error);
                setAdminSections([]);
                setGridSections([]);
                setSection4Data([]);
            }
        };
        fetchData();
    }, []);

    const curatedSections = useMemo(() => {
        return adminSections.map(section => {
            let sectionProducts = section.productIds?.length > 0
                ? products.filter(p => section.productIds.includes(p.id))
                : products;

            // Filter by category if specified
            if (section.category) {
                sectionProducts = sectionProducts.filter(p => p.category === section.category);
            }

            return {
                title: section.section,
                products: sectionProducts,
                viewAllLink: section.category ? `/shop?category=${section.category}` : '/shop'
            };
        });
    }, [adminSections, products]);

    // Fallback: Create sections based on categories if no admin sections
    const categorySections = useMemo(() => {
        if (adminSections.length > 0) return [];
        
        const categories = [...new Set(products.map(p => (p.category || '').toLowerCase()))];

        return categories.slice(0, 4).map(category => ({
            title: `Top Deals on ${category.charAt(0).toUpperCase() + category.slice(1)}`,
            products: products.filter(p => (p.category || '').toLowerCase() === category),
            viewAllLink: `/shop?category=${category}`
        }));
    }, [products, adminSections]);

    const sections = curatedSections.length > 0 ? curatedSections : categorySections;

    // Prepare grid sections with product details
    const gridSectionsWithProducts = gridSections.map(section => ({
        ...section,
        products: (section.productIds || []).map(pid => products.find(p => p.id === pid)).filter(Boolean)
    }));
    // Only show grid if at least one section has a title and products
    const showGrid = gridSectionsWithProducts.some(s => s.title && s.products && s.products.length > 0);

    return (
        <>
            <HomeCategories/>
            <Hero />
            <LatestProducts />
            <BannerSlider/>
            <Section3/>
            
            {/* Category Sections */}
            {section4Data.length > 0 && (
                <Section4 sections={section4Data} />
            )}
            
            <OriginalBrands/>
            <QuickFyndCategoryDirectory/>
            <KeywordPills />
        </>
    );
}
