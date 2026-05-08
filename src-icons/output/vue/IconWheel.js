import { defineComponent, h } from 'vue';

export const IconWheel = defineComponent({
  name: 'IconWheel',
  props: {
    class: {
      type: String,
      default: ''
    }
  },
  setup(props, { attrs }) {
    return () => h(
      'svg',
      {
        viewBox: '0 0 20 20',
        
        class: `tiangong-icons ${props.class}`,
        ...attrs
      },
      [
        
      ]
    );
  }
});
